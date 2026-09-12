"""Training corpus for the rental-complaint classifier.

Authored, not collected. There is no public dataset of Ghanaian tenant
complaints, so this is written to cover how people actually describe these
situations: standard English, Ghanaian English, and pidgin, with the
spellings and idioms that show up in practice ("chop my money", "she vex",
"landlady dey force me", "one year advance").

Two things matter more than volume here.

HARD NEGATIVES. Roughly a third of the corpus is lawful or neutral situations
that share vocabulary with violations — a lawful three-month advance, a
deposit correctly returned, a landlord who gave proper notice, repairs that
were done. The failure this model exists to prevent is telling a tenant their
landlord committed a crime when they did not, and a classifier trained only
on violations will call everything a violation.

MULTI-LABEL. Real complaints bundle several things at once: the lock was
changed AND the water was cut AND he is shouting threats. Labels are
therefore a set, not a single class.

The honest caveat: authored data reflects how the author imagines complaints
are phrased. Real traffic will differ, which is exactly why predictions are
logged with their input so the corpus can be replaced with real, reviewed
examples. Treat the evaluation numbers as a floor on a distribution we chose,
not as accuracy on Ghanaian tenants.
"""

# (text, labels)
Example = tuple[str, tuple[str, ...]]

ADVANCE: list[Example] = [
    ("My landlord is demanding two years rent advance before I can move in", ("excessive_advance",)),
    ("He wants 12 months advance, I only have 6", ("excessive_advance",)),
    ("The agent says I must pay one year advance upfront", ("excessive_advance",)),
    ("Landlord dey force me pay 18 months advance before I enter the room", ("excessive_advance",)),
    ("She is asking for three years rent in advance for a single room", ("excessive_advance",)),
    ("I was told to bring 24 months advance or lose the place", ("excessive_advance",)),
    ("They want 10 months upfront before handing over the keys", ("excessive_advance",)),
    ("My new landlord insists on 2 years advance payment", ("excessive_advance",)),
    ("Is it normal to pay 15 months rent before moving in?", ("excessive_advance",)),
    ("The caretaker says advance is one year, take it or leave it", ("excessive_advance",)),
    ("He increased the advance from 6 months to 12 months when I asked to renew", ("excessive_advance", "illegal_rent_increase")),
    ("I paid 8 months advance and he still wants more money every month", ("excessive_advance",)),
    ("Landlord demand say make I pay two years advance, I no get that money", ("excessive_advance",)),
    ("They are asking for a year and a half advance for a chamber and hall", ("excessive_advance",)),
    ("My rent advance was 7 months, is that allowed?", ("excessive_advance",)),
    ("How many months advance can a landlord legally ask for in Ghana?", ("excessive_advance",)),
    ("The landlord wants advance for the whole lease period at once", ("excessive_advance",)),
    ("I am being asked to pay rent two years ahead", ("excessive_advance",)),
]

EVICTION: list[Example] = [
    ("My landlord changed the locks while I was at work", ("illegal_eviction",)),
    ("He put my things outside without any court order", ("illegal_eviction",)),
    ("She told me to leave the house by Friday or she will throw my bags out", ("illegal_eviction", "harassment")),
    ("The landlord padlocked my door because I was late with rent", ("illegal_eviction",)),
    ("They want me out in three days, no notice was given", ("illegal_eviction",)),
    ("Landlord say make I pack comot tomorrow, no court, nothing", ("illegal_eviction",)),
    ("He is threatening to remove the roof if I do not vacate", ("illegal_eviction", "harassment")),
    ("My belongings were dumped in the compound while I was away", ("illegal_eviction",)),
    ("The caretaker locked me out and refuses to let me in", ("illegal_eviction",)),
    ("I have been told to vacate immediately even though my rent is paid", ("illegal_eviction",)),
    ("She brought thugs to force me out of the room", ("illegal_eviction", "harassment")),
    ("He evicted me without going to court first", ("illegal_eviction",)),
    ("Can my landlord throw me out without a court order?", ("illegal_eviction",)),
    ("They changed the gate lock and my key no longer works", ("illegal_eviction",)),
    ("My landlord is chasing me out because he wants to rent to someone else", ("illegal_eviction",)),
    ("He said if I do not leave by month end he will break the door", ("illegal_eviction", "harassment")),
]

INCREASE: list[Example] = [
    ("My rent was doubled in the middle of my lease", ("illegal_rent_increase",)),
    ("The landlord raised the rent from 800 to 1500 without any notice", ("illegal_rent_increase",)),
    ("He increased my rent three times this year", ("illegal_rent_increase",)),
    ("Rent went up by 60 percent with two weeks notice", ("illegal_rent_increase",)),
    ("She says the new price is effective immediately", ("illegal_rent_increase",)),
    ("Landlord don increase the rent again, no explanation", ("illegal_rent_increase",)),
    ("My rent keeps going up every few months arbitrarily", ("illegal_rent_increase",)),
    ("The agreement says 1200 but he is now charging 2000", ("illegal_rent_increase",)),
    ("Is my landlord allowed to increase rent during a fixed term lease?", ("illegal_rent_increase",)),
    ("He hiked the rent after I complained about the leaking roof", ("illegal_rent_increase", "harassment")),
    ("They raised rent and also cut the water when I objected", ("illegal_rent_increase", "utility_disconnection")),
    ("New rent announced by text message, effective next week", ("illegal_rent_increase",)),
]

DEPOSIT: list[Example] = [
    ("My landlord refuses to return my security deposit after I moved out", ("deposit_withholding",)),
    ("She kept my caution money claiming damages I never caused", ("deposit_withholding",)),
    ("It has been six months and my deposit has not been refunded", ("deposit_withholding",)),
    ("He says the deposit is non refundable, is that legal?", ("deposit_withholding",)),
    ("Landlord chop my deposit and no dey pick my calls", ("deposit_withholding",)),
    ("I left the room clean but she will not give back the caution fee", ("deposit_withholding",)),
    ("They deducted the entire deposit for normal wear and tear", ("deposit_withholding",)),
    ("My deposit is being withheld with no itemised reason", ("deposit_withholding",)),
    ("Can a landlord keep my security deposit without explanation?", ("deposit_withholding",)),
    ("He is refusing to refund the deposit and also owes me for repairs I paid for", ("deposit_withholding", "repairs_neglect")),
]

UTILITIES: list[Example] = [
    ("My landlord disconnected the electricity to force me out", ("utility_disconnection", "illegal_eviction")),
    ("There has been no water for two weeks because he removed the meter", ("utility_disconnection",)),
    ("She cut the light because I complained to Rent Control", ("utility_disconnection", "harassment")),
    ("The landlord switched off the power to my room only", ("utility_disconnection",)),
    ("He removed the ECG meter from my apartment", ("utility_disconnection",)),
    ("Landlord don off the light say make I comot", ("utility_disconnection", "illegal_eviction")),
    ("Water has been locked at the tap since I asked about the receipt", ("utility_disconnection", "harassment")),
    ("Is it legal for a landlord to disconnect utilities over unpaid rent?", ("utility_disconnection",)),
    ("They shut off the borehole pump to pressure us to leave", ("utility_disconnection", "illegal_eviction")),
]

ENTRY: list[Example] = [
    ("My landlord enters my room whenever he likes without telling me", ("entry_without_notice",)),
    ("She used her spare key to come in while I was out", ("entry_without_notice",)),
    ("He barged into my apartment at 6am with no notice", ("entry_without_notice",)),
    ("The caretaker walks into my room without knocking", ("entry_without_notice",)),
    ("Strangers were shown around my flat while I was at work", ("entry_without_notice",)),
    ("Landlord dey enter my room anyhow, he no dey ask", ("entry_without_notice",)),
    ("He inspects the room without permission every weekend", ("entry_without_notice",)),
    ("Does my landlord need to give notice before entering?", ("entry_without_notice",)),
    ("She entered without consent and went through my things", ("entry_without_notice", "harassment")),
]

RECEIPTS: list[Example] = [
    ("My landlord refuses to give me a receipt for the rent I pay", ("receipt_refusal",)),
    ("I have paid for two years and never received any proof of payment", ("receipt_refusal",)),
    ("He says receipts are not necessary between us", ("receipt_refusal",)),
    ("She will not provide a written record of my payments", ("receipt_refusal",)),
    ("Landlord no dey give receipt when I pay", ("receipt_refusal",)),
    ("No receipt has ever been issued for my rent", ("receipt_refusal",)),
    ("Am I entitled to a rent receipt in Ghana?", ("receipt_refusal",)),
    ("He refuses receipts and now claims I owe three months", ("receipt_refusal", "harassment")),
]

REPAIRS: list[Example] = [
    ("The roof has been leaking for months and my landlord ignores me", ("repairs_neglect",)),
    ("The toilet has been broken since January and nothing is done", ("repairs_neglect",)),
    ("There is no running water and he refuses to fix the pipes", ("repairs_neglect",)),
    ("The wiring is dangerous and sparks but nobody comes to repair it", ("repairs_neglect",)),
    ("Mould is growing on the walls and my complaints are ignored", ("repairs_neglect",)),
    ("Landlord no dey fix the leaking roof, I don talk tire", ("repairs_neglect",)),
    ("The ceiling collapsed and he says it is my problem", ("repairs_neglect",)),
    ("Is the landlord responsible for fixing the plumbing?", ("repairs_neglect",)),
    ("I paid for the repairs myself and he will not reimburse me", ("repairs_neglect",)),
    ("Broken windows since I moved in, no repairs, and now he wants more rent", ("repairs_neglect", "illegal_rent_increase")),
]

HARASSMENT: list[Example] = [
    ("My landlord shouts at me and threatens me in front of neighbours", ("harassment",)),
    ("He sends me threatening messages every night", ("harassment",)),
    ("She insults me whenever she sees me in the compound", ("harassment",)),
    ("The landlord threatened to beat me if I do not pay", ("harassment",)),
    ("I am being intimidated for asking about my rights", ("harassment",)),
    ("Landlord dey threaten me say he go deal with me", ("harassment",)),
    ("He follows me around and bangs on my door at midnight", ("harassment",)),
    ("She threatened to report me to immigration if I complain", ("harassment", "discrimination")),
]

DISCRIMINATION: list[Example] = [
    ("The landlord refused to rent to me because of my tribe", ("discrimination",)),
    ("He said he does not rent to people from the north", ("discrimination",)),
    ("She turned me away because I am a single mother", ("discrimination",)),
    ("They rejected my application because of my religion", ("discrimination",)),
    ("The agent said no foreigners allowed in this house", ("discrimination",)),
    ("I was denied the room because of my disability", ("discrimination",)),
    ("He raised the price only for me because of where I come from", ("discrimination", "illegal_rent_increase")),
]

#: Lawful, resolved, or simply neutral situations. These carry no label.
#:
#: They share vocabulary with the violation classes on purpose — advance,
#: deposit, notice, increase, repairs all appear here in lawful settings. A
#: classifier that has not seen these will flag every mention of "advance".
NEGATIVES: list[Example] = [
    ("My landlord asked for 3 months rent advance which I paid happily", ()),
    ("I paid 6 months advance as agreed in the tenancy agreement", ()),
    ("The advance was two months and everything went smoothly", ()),
    ("My landlord did not ask for any advance and has been very fair", ()),
    ("Rent advance here is reasonable, only four months", ()),
    ("He returned my full security deposit within two weeks of moving out", ()),
    ("My deposit was refunded promptly, no deductions", ()),
    ("She gave me a proper receipt for every payment I have made", ()),
    ("I get a receipt each month without asking", ()),
    ("The landlord fixed the leaking tap the same day I reported it", ()),
    ("Repairs are handled quickly whenever I call the caretaker", ()),
    ("He gave me six months written notice before the rent goes up", ()),
    ("The rent increase was agreed in writing at renewal and it is modest", ()),
    ("My landlord always calls a day before he comes to inspect", ()),
    ("He asks permission before entering and never just walks in", ()),
    ("The rent is 800 cedis and everything is fine, no complaints at all", ()),
    ("I want to know how to renew my tenancy agreement", ()),
    ("What documents do I need to rent a place in Accra?", ()),
    ("How do I find a two bedroom apartment in Tema?", ()),
    ("My landlord is very helpful and responsive", ()),
    ("I am looking for advice on saving for rent advance", ()),
    ("Where is the Rent Control Department office located?", ()),
    ("Can I sublet my room with my landlord's written permission?", ()),
    ("I paid my rent late and my landlord was understanding about it", ()),
    ("The water was off for a day because Ghana Water was working on the mains", ()),
    ("ECG did a scheduled power cut in our area last night", ()),
    ("My neighbour plays loud music, can I complain to the landlord?", ()),
    ("I want to move out at the end of my lease, what notice do I give?", ()),
    ("My landlord agreed to reduce the rent because of the broken fence", ()),
    ("Everything in the agreement was explained to me before I signed", ()),
    ("I am happy with my accommodation and the landlord is reasonable", ()),
    ("The caretaker gave notice before the plumber came to fix the sink", ()),
    ("How much is the average rent for a single room in Kumasi?", ()),
    ("I need help understanding my tenancy agreement terms", ()),
]

TRAINING_EXAMPLES: list[Example] = (
    ADVANCE + EVICTION + INCREASE + DEPOSIT + UTILITIES
    + ENTRY + RECEIPTS + REPAIRS + HARASSMENT + DISCRIMINATION + NEGATIVES
)
