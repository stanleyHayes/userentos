"""Corpus augmentation for the complaint classifier.

The hand-written corpus is right but small — roughly 140 examples across ten
labels, which leaves about three held-out positives per label. Thresholds and
precision estimates fitted on three examples mean nothing, and four labels
could not be tuned at all.

There is no public dataset of Ghanaian tenant complaints to fall back on, so
the corpus is composed instead: each label gets a grammar of the ways people
actually say that thing — who is doing it, what they did, how it is phrased
in standard English, Ghanaian English and pidgin — and variants are generated
across that grammar.

This buys coverage of SURFACE FORM, not of new facts. A generated variant
teaches the model that "the caretaker padlocked my door" and "my landlady has
locked me out" are the same complaint; it cannot teach it about a situation
nobody wrote a frame for. So the grammars stay close to real phrasing and the
hand-written examples are kept as-is, and the honest description of the
result is "trained on authored data covering the phrasings we anticipated".

Real traffic is logged with its prediction precisely so this can be replaced
by reviewed examples of what people actually write.
"""

import itertools
import random

Example = tuple[str, tuple[str, ...]]

SEED = 20260912

#: Who the complaint is about. Real complaints name all of these.
ACTORS = [
    "my landlord", "the landlord", "my landlady", "the landlady",
    "the caretaker", "the agent", "the house owner", "my house owner",
    "the property manager", "the owner of the house",
]

#: Ghanaian pidgin subject forms, which appear often in free-text complaints.
PIDGIN_ACTORS = ["landlord", "landlady", "the caretaker", "house owner"]

#: Framings that wrap a complaint. Some are statements, some questions —
#: people ask "is this legal?" as often as they assert "this is illegal".
FRAMES = [
    "{clause}",
    "{clause}, what can I do?",
    "{clause}. Is this legal in Ghana?",
    "Please help, {clause}",
    "I need advice, {clause}",
    "{clause} and I do not know my rights",
    "For the past few months {clause}",
    "Since I moved in {clause}",
    "{clause}. Can I report this to Rent Control?",
    "I am a tenant in Accra and {clause}",
    "I stay in a chamber and hall and {clause}",
]

#: Per-label clause grammars: (verb phrase alternatives, object alternatives).
#: Composed as "{actor} {verb} {object}".
CLAUSES: dict[str, list[tuple[list[str], list[str]]]] = {
    "excessive_advance": [
        (["is demanding", "is asking for", "wants", "insists on", "is forcing me to pay",
          "will not accept less than", "has demanded"],
         ["two years rent advance", "three years advance", "12 months advance",
          "18 months rent upfront", "24 months advance", "a full year advance",
          "two years rent in advance", "15 months rent advance", "10 months upfront",
          "one year advance before I can move in", "8 months advance"]),
    ],
    "illegal_eviction": [
        (["changed the locks on", "padlocked", "locked me out of", "bolted",
          "put a new lock on", "sealed"],
         ["my room", "my apartment", "the door", "my flat", "the gate", "my shop"]),
        (["threw out", "dumped", "removed", "packed out", "threw away"],
         ["my belongings", "all my things", "my luggage", "my property",
          "my bags into the compound"]),
        (["is evicting me", "wants me out", "told me to vacate", "is chasing me out",
          "says I must leave"],
         ["without a court order", "without any notice", "by the end of the week",
          "tomorrow morning", "even though my rent is paid", "with no warning at all"]),
    ],
    "illegal_rent_increase": [
        (["increased", "raised", "doubled", "hiked", "put up"],
         ["my rent in the middle of the lease", "the rent without notice",
          "the rent by more than half", "my rent twice this year",
          "the rent from 800 to 1500 with no explanation",
          "the rent right after I complained"]),
        (["says the new rent is", "announced a new rent of", "is now charging"],
         ["effective immediately", "double what I agreed", "far above the agreement",
          "more than the tenancy agreement says"]),
    ],
    "deposit_withholding": [
        (["refuses to return", "will not refund", "is keeping", "has kept",
          "has not returned", "refuses to refund"],
         ["my security deposit", "my caution money", "my deposit",
          "the deposit after I moved out", "my caution fee for no reason",
          "my deposit claiming damage I did not cause"]),
    ],
    "utility_disconnection": [
        (["cut", "disconnected", "switched off", "removed", "shut off", "locked"],
         ["the electricity to my room", "the water supply", "the light",
          "the ECG meter", "the power because I complained",
          "the water to force me out", "the borehole pump"]),
    ],
    "entry_without_notice": [
        (["enters", "comes into", "walks into", "lets himself into", "barges into"],
         ["my room whenever he likes", "my apartment without telling me",
          "my flat without permission", "my room without knocking",
          "the house while I am at work", "my room without any notice"]),
        (["showed", "brought"],
         ["strangers around my flat while I was out",
          "people into my room without asking me"]),
    ],
    "receipt_refusal": [
        (["refuses to give me", "will not issue", "never gives me", "has never given me",
          "refuses to provide"],
         ["a receipt for my rent", "any proof of payment", "a written record of payments",
          "receipts even though I have paid for two years",
          "a rent receipt when I pay"]),
    ],
    "repairs_neglect": [
        (["refuses to fix", "will not repair", "has ignored", "does nothing about",
          "has not fixed"],
         ["the leaking roof", "the broken toilet", "the burst pipes",
          "the dangerous wiring", "the collapsed ceiling", "the broken windows",
          "the mould on the walls", "the blocked drain for months"]),
    ],
    "harassment": [
        (["shouts at me", "threatens me", "insults me", "intimidates me",
          "sends me threatening messages", "banged on my door"],
         ["in front of the neighbours", "every night", "whenever I ask about repairs",
          "for asking about my rights", "at midnight", "and says he will deal with me"]),
    ],
    "discrimination": [
        (["refused to rent to me", "turned me away", "rejected my application",
          "would not give me the room", "said no to me"],
         ["because of my tribe", "because of where I come from",
          "because I am a single mother", "because of my religion",
          "because I am a foreigner", "because of my disability",
          "because he does not rent to people from the north"]),
    ],
}

#: Pidgin frames, kept separate because the word order differs.
PIDGIN: dict[str, list[str]] = {
    "excessive_advance": [
        "{actor} dey force me pay two years advance",
        "{actor} say make I pay one year advance before I enter",
        "{actor} want 18 months advance, I no get that money",
        "dem dey ask me 24 months advance for small room",
    ],
    "illegal_eviction": [
        "{actor} don lock my door, I no fit enter",
        "{actor} say make I pack comot tomorrow, no court nothing",
        "{actor} throw my things outside when I no dey house",
        "dem wan chase me comot without notice",
    ],
    "illegal_rent_increase": [
        "{actor} don increase the rent again, no explanation",
        "{actor} say the rent don double from next month",
    ],
    "deposit_withholding": [
        "{actor} chop my deposit and e no dey pick call",
        "{actor} no wan give me back my caution money",
    ],
    "utility_disconnection": [
        "{actor} don off the light say make I comot",
        "{actor} lock the tap, we no get water for two weeks",
    ],
    "entry_without_notice": [
        "{actor} dey enter my room anyhow, e no dey ask",
        "{actor} dey use spare key enter when I no dey",
    ],
    "receipt_refusal": [
        "{actor} no dey give receipt when I pay rent",
        "I don pay for two years but {actor} never give me any paper",
    ],
    "repairs_neglect": [
        "{actor} no dey fix the leaking roof, I don talk tire",
        "toilet don spoil since January, {actor} no do anything",
    ],
    "harassment": [
        "{actor} dey threaten me say he go deal with me",
        "{actor} dey shout for me anyhow for compound",
    ],
    "discrimination": [
        "{actor} say he no dey rent to people from my side",
        "dem refuse me the room because of my tribe",
    ],
}

#: Lawful and neutral variants. Same grammar treatment as the violations, so
#: the model sees the shared vocabulary in both settings and cannot learn
#: "the word advance means a crime".
NEGATIVE_CLAUSES: list[tuple[list[str], list[str]]] = [
    # Lawful counterparts of every violation class. Without these the model
    # learns "the word deposit means a crime": on a first pass, 13 of 34
    # lawful situations drew at least one false accusation.
    (["followed the proper process to", "went to court to", "got a court order to"],
     ["end my tenancy", "recover the property", "evict the previous tenant"]),
    (["gave three months notice before", "wrote to me before", "agreed with me before"],
     ["increasing the rent", "the inspection", "ending the tenancy",
      "any change to the agreement"]),
    (["restored", "reconnected", "paid"],
     ["the water supply the same day", "the electricity after the ECG fault",
      "the utility bill himself"]),
    (["deducted", "withheld"],
     ["only the unpaid rent I actually owed, and refunded the rest",
      "a fair amount for the damage I caused and returned the balance"]),
    (["explained", "showed me", "walked me through"],
     ["the tenancy agreement clearly", "the rent receipt book",
      "how the advance was calculated"]),
    (["never enters", "does not enter", "has never entered"],
     ["my room without asking", "the flat without notice",
      "my apartment when I am away"]),
    (["has not increased", "did not raise", "kept"],
     ["the rent since I moved in", "the rent the same for three years",
      "my rent unchanged despite the market"]),

    (["asked for", "requested", "agreed on", "accepted"],
     ["3 months rent advance which I paid happily", "two months advance, which is fair",
      "six months advance as the agreement says", "4 months advance and gave me a receipt",
      "a reasonable advance of five months"]),
    # Lawful returns, crossed over the same objects the violation class uses.
    # With only three phrasings here the model keyed on the word "deposit"
    # itself: "returned my deposit promptly" came back as withholding.
    (["returned", "refunded", "gave back", "paid back", "sent back",
      "released", "returned promptly", "refunded in full"],
     ["my security deposit", "my caution money", "my deposit", "the deposit",
      "my deposit in full", "my full security deposit within two weeks",
      "my deposit with no deductions", "my caution money when I moved out",
      "my deposit the week I left", "every cedi of my deposit"]),
    (["always gives me", "issues", "provides"],
     ["a receipt for every payment", "proper receipts each month",
      "a written record whenever I pay"]),
    (["fixed", "repaired", "sorted out"],
     ["the leaking tap the same day", "the broken door within a week",
      "the wiring as soon as I reported it"]),
    (["gave me", "served"],
     ["six months written notice before the rent goes up",
      "proper notice before the inspection", "notice in writing as required"]),
    (["asks permission before", "calls a day before", "always knocks before"],
     ["entering my room", "coming to inspect", "visiting the house"]),
    (["did not ask for", "never demanded", "has not requested"],
     ["any advance", "more than the legal advance", "a deposit at all"]),
]

NEUTRAL: list[str] = [
    "How do I find a two bedroom apartment in Tema?",
    "What documents do I need to rent a place in Accra?",
    "Where is the Rent Control Department office located?",
    "How much is the average rent for a single room in Kumasi?",
    "I want to know how to renew my tenancy agreement",
    "Can I sublet my room with my landlord's written permission?",
    "I am looking for advice on saving for rent advance",
    "What notice do I give if I want to move out at the end of my lease?",
    "I need help understanding my tenancy agreement terms",
    "Is there a standard tenancy agreement template for Ghana?",
    "How do I transfer my tenancy to another person?",
    "What is the process for registering a tenancy?",
    "My neighbour plays loud music, can I complain to the landlord?",
    "ECG did a scheduled power cut in our area last night",
    "The water was off for a day because Ghana Water was working on the mains",
    "I paid my rent late and my landlord was understanding about it",
    "My landlord is very helpful and responsive",
    "Everything in the agreement was explained to me before I signed",
    "I am happy with my accommodation and the landlord is reasonable",
    "My landlord agreed to reduce the rent because of the broken fence",
    "What is the difference between a tenancy agreement and a lease?",
    "Do I need a lawyer to sign a tenancy agreement in Ghana?",
    "How long does a Rent Control mediation usually take?",
    "Can I pay my rent by mobile money?",
    "What happens to my tenancy if the landlord sells the house?",
    "Is a verbal tenancy agreement valid in Ghana?",
    "How do I check if a property is genuinely available?",
    "What is a chamber and hall exactly?",
    "Are utilities usually included in the rent in Accra?",
    "How do I calculate what rent I can afford on my salary?",
    "Can two people share a tenancy agreement?",
    "What is the notice period for a monthly tenancy?",
    "Does the landlord pay the property rate or do I?",
    "I want to understand the rent advance rules before I sign anything",
    "Who is responsible for the water bill in a shared compound?",
    "My rent is due next week and I have the money ready",
    "I am moving to Kumasi for work and need somewhere by December",
    "The landlord and I signed the agreement at the Rent Control office",
    "I renewed my tenancy for another year on the same terms",
    "The caretaker is friendly and fixes things quickly",
    # Tenant-initiated moves. These use the vocabulary of eviction — vacate,
    # leave, notice, move out — with the tenant as the actor, and without
    # them the model read "I want to vacate at the end of my lease, what
    # notice do I give?" as an illegal eviction.
    "I want to vacate at the end of my lease, what notice do I give?",
    "I am moving out next month, do I need to give notice in writing?",
    "How much notice must I give my landlord before I vacate?",
    "I plan to leave the house when my tenancy ends in December",
    "I want to terminate my tenancy early, what are my options?",
    "Can I get my deposit back if I vacate properly and leave the room clean?",
    "I am leaving the room at the end of the month as we agreed",
    "My lease is ending and I want to move out without any problem",
    "I gave my landlord three months notice that I am vacating",
    "What is the correct way to hand over the keys when I move out?",
    "I want to break my lease because I got a job in another city",
    "Do I have to pack out on the exact day the tenancy ends?",
    "I am relocating and need to end my tenancy properly",
    "The tenancy is finishing and I want to leave on good terms",
    # Lawful process described from the tenant's side.
    "My landlord went to court and got a proper order, what happens now?",
    "The court has scheduled a hearing about my tenancy next month",
    "Rent Control mediated and we reached an agreement",
    "We settled the dispute at the Rent Control office amicably",
    "My landlord followed the correct legal process throughout",
]


def _compose(actor: str, verb: str, obj: str) -> str:
    return f"{actor} {verb} {obj}"


def generate(per_label: int = 160, negatives: int = 900) -> list[Example]:
    """Build the augmented corpus. Deterministic for a given seed."""
    rng = random.Random(SEED)
    out: list[Example] = []

    for label, groups in CLAUSES.items():
        combos: list[str] = []
        for verbs, objects in groups:
            combos.extend(_compose(a, v, o)
                          for a, v, o in itertools.product(ACTORS, verbs, objects))
        rng.shuffle(combos)

        for clause in combos[:per_label]:
            frame = rng.choice(FRAMES)
            out.append((frame.format(clause=clause), (label,)))

        for template in PIDGIN.get(label, []):
            for actor in PIDGIN_ACTORS:
                out.append((template.format(actor=actor), (label,)))

    negative_combos: list[str] = []
    for verbs, objects in NEGATIVE_CLAUSES:
        negative_combos.extend(_compose(a, v, o)
                               for a, v, o in itertools.product(ACTORS, verbs, objects))
    rng.shuffle(negative_combos)
    for clause in negative_combos[:negatives]:
        out.append((rng.choice(FRAMES).format(clause=clause), ()))

    # Neutral questions repeated with light framing variation, so "no
    # violation" is not learned purely from lawful-landlord sentences.
    for text in NEUTRAL:
        out.append((text, ()))
        out.append((rng.choice(FRAMES).format(clause=text.rstrip("?.")), ()))

    return out
