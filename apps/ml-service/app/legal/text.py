"""Text normalisation and featurisation for the complaint classifier.

Word n-grams alone are brittle on this traffic. People write "landlordd",
"evikt", "recipt", "advanc", and Ghanaian pidgin spellings vary freely
("comot"/"komot", "dey"/"de"). Character n-grams degrade gracefully through
all of that: a misspelling shares most of its character trigrams with the
correct form, so the feature vector barely moves.

Both views are used. Word 1-2 grams carry the phrases that matter ("court
order", "changed the lock", "not refund"), character 3-5 grams carry
robustness. They are hashed into one shared space, which keeps the model a
single dense weight matrix and the vocabulary bounded regardless of what
arrives.
"""

import math
import re
import unicodedata

#: Size of the hashed feature space.
#:
#: 2**18 keeps collisions negligible for a vocabulary this size while the
#: weight matrix stays small enough to hold per label (262144 floats = 2MB at
#: float64, and there are ten labels). Inference touches only the features
#: present in the text, so width costs memory, never latency.
N_FEATURES = 1 << 18

#: Cap on input length. Beyond this the text is truncated rather than
#: rejected: a long complaint is still a complaint, but an unbounded input is
#: a CPU cost an unauthenticated endpoint should not accept.
MAX_CHARS = 4000

_WORD_RE = re.compile(r"[a-z0-9']+")

#: Deliberately NOT removed: "no", "not", "never", "without". Negation is the
#: difference between "he did not return my deposit" and "he returned my
#: deposit", and dropping it inverts the meaning of the complaint.
STOPWORDS = frozenset("""
a an the is are was were be been being am of in on at to for with by from as
that this these those it its i my me we our you your he she they them his her
their and or but if so then than there here what which who whom when how
""".split())


def normalise(text: str) -> str:
    """Lowercase, strip accents, collapse whitespace, bound the length."""
    text = unicodedata.normalize("NFKD", text[:MAX_CHARS])
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = text.lower()
    # Keep digits: "12 months" is the difference between lawful and not.
    text = re.sub(r"[^a-z0-9'\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _hash(token: str) -> int:
    """Stable across processes and runs, unlike Python's salted hash().

    FNV-1a. The artifact stores weights by feature INDEX, so a hash that
    changed between runs would silently invalidate every trained weight.
    """
    h = 0x811C9DC5
    for byte in token.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def features(text: str) -> dict[int, float]:
    """Hashed word 1-2 grams and character 3-5 grams, sublinear-tf weighted.

    Returns index -> weight, L2-normalised. Sparse by construction: a typical
    complaint touches a few hundred of the 262144 dimensions, so scoring is a
    few hundred multiply-adds per label.
    """
    norm = normalise(text)
    if not norm:
        return {}

    counts: dict[int, float] = {}

    def add(token: str) -> None:
        idx = _hash(token) % N_FEATURES
        counts[idx] = counts.get(idx, 0.0) + 1.0

    words = _WORD_RE.findall(norm)
    content = [w for w in words if w not in STOPWORDS]

    for w in content:
        add(f"w:{w}")
    # Bigrams over the ORIGINAL word sequence, stopwords included: "not
    # returned" and "without notice" are exactly the signal, and they vanish
    # if stopwords are stripped first.
    for a, b in zip(words, words[1:]):
        add(f"w2:{a} {b}")

    padded = f" {norm} "
    for n in (3, 4, 5):
        for i in range(len(padded) - n + 1):
            add(f"c{n}:{padded[i:i + n]}")

    # Sublinear tf: a word repeated ten times is not ten times the evidence.
    weighted = {idx: 1.0 + math.log(c) for idx, c in counts.items()}

    norm_factor = sum(v * v for v in weighted.values()) ** 0.5
    if norm_factor == 0:
        return {}
    return {idx: v / norm_factor for idx, v in weighted.items()}
