"""
Style-similarity function between two tagged books. Pure Python, no
database access, so it can be tested on its own without a running DB.
"""

# Weight of each style attribute in the similarity score. All ten start
# equal - a deliberate v1 baseline, not a guess (see DECISIONS.md). One
# dict, in one place: a future tuning pass edits only this and nothing
# else in the file.
WEIGHTS = {
    "sentence_length": 1,
    "description_density": 1,
    "dialogue_ratio": 1,
    "pov": 1,
    "is_present_tense": 1,
    "tone": 1,
    "pacing": 1,
    "vocabulary_complexity": 1,
    "is_nonlinear": 1,
    "has_humor": 1,
}

# Attributes stored on a 1-5 numeric scale. Every other attribute in
# WEIGHTS is categorical or boolean and compared for exact equality
# instead (see the approved similarity approach in DECISIONS.md).
NUMERIC_ATTRIBUTES = {"description_density", "tone", "pacing", "vocabulary_complexity"}
NUMERIC_SCALE_MAX_DIFF = 4  # 5 - 1: largest possible difference on a 1-5 scale

# Human-readable label for each attribute, used to build rationale text.
# Rationale text is user-facing, so it is in Hebrew (see DECISIONS.md);
# names, comments, and everything else in this file stay English.
ATTRIBUTE_LABELS = {
    "sentence_length": "אורך משפטים",
    "description_density": "צפיפות תיאור",
    "dialogue_ratio": "יחס דיאלוג",
    "pov": "גוף הסיפור",
    "is_present_tense": "זמן דקדוקי",
    "tone": "טון",
    "pacing": "קצב",
    "vocabulary_complexity": "מורכבות אוצר מילים",
    "is_nonlinear": "מבנה עלילה",
    "has_humor": "הומור",
}

# How to word True/False for each boolean attribute in a sentence.
BOOLEAN_LABELS = {
    "is_present_tense": {True: "זמן הווה", False: "זמן עבר"},
    "is_nonlinear": {True: "מבנה לא-ליניארי", False: "מבנה ליניארי"},
    "has_humor": {True: "הומור", False: "בלי הומור"},
}

# How to word each stored categorical value (English, from the database -
# see DECISIONS.md on why the database stays English) in a rationale
# sentence. Keyed by attribute name, then by the stored value.
CATEGORICAL_VALUE_LABELS = {
    "sentence_length": {"short": "קצר", "medium": "בינוני", "long": "ארוך"},
    "dialogue_ratio": {"low": "נמוך", "medium": "בינוני", "high": "גבוה"},
    "pov": {
        "first": "גוף ראשון",
        "third_limited": "גוף שלישי מוגבל",
        "third_omniscient": "גוף שלישי יודע-כל",
        "second": "גוף שני",
    },
}

RATIONALE_ATTRIBUTE_COUNT = 3  # how many attributes the rationale mentions


# Takes one attribute's value from each book and the attribute's name.
# Returns a number from 0 (identical) to 1 (as different as this
# attribute allows). Exists so every attribute is compared by one shared
# rule instead of special-casing each attribute at the call site.
def attribute_distance(name, value_a, value_b):
    if name in NUMERIC_ATTRIBUTES:
        return abs(value_a - value_b) / NUMERIC_SCALE_MAX_DIFF
    return 0.0 if value_a == value_b else 1.0


# Takes one attribute's name and its value in each book. Returns a short
# sentence describing how the two books compare on that attribute (equal
# or different both get a sentence - closeness alone doesn't mean
# equality for a numeric attribute, and "closest" attributes can still
# differ when two books have little in common). Exists to turn a raw
# attribute pair into the wording used in a rationale.
def describe_attribute(name, value_a, value_b):
    label = ATTRIBUTE_LABELS[name]
    if name in NUMERIC_ATTRIBUTES:
        if value_a == value_b:
            return f"שני הספרים זהים ב{label} ({value_a})."
        return f"{label} דומה ({value_a} לעומת {value_b})."
    if name in BOOLEAN_LABELS:
        if value_a == value_b:
            return f"לשני הספרים {BOOLEAN_LABELS[name][value_a]}."
        return f"הבדל ב{label}: {BOOLEAN_LABELS[name][value_a]} לעומת {BOOLEAN_LABELS[name][value_b]}."
    # Remaining attributes are plain categorical text (sentence_length,
    # dialogue_ratio, pov) - translate the stored English value for display.
    labels = CATEGORICAL_VALUE_LABELS[name]
    if value_a == value_b:
        return f"שני הספרים {labels[value_a]} ב{label}."
    return f"הבדל ב{label}: {labels[value_a]} לעומת {labels[value_b]}."


# Takes the two books' attribute dicts and the per-attribute distances
# already computed for them. Returns a list of RATIONALE_ATTRIBUTE_COUNT
# sentences, for the attributes where the books are closest, closest
# first. Only attributes present in distances can be picked, so an
# unknown attribute (see similarity below) never shows up here. Exists
# to satisfy the product's hard requirement that every recommendation
# comes back with a readable rationale, not just a score.
def build_rationale(attributes_a, attributes_b, distances):
    closest_first = sorted(distances, key=distances.get)
    top = closest_first[:RATIONALE_ATTRIBUTE_COUNT]
    return [describe_attribute(name, attributes_a[name], attributes_b[name]) for name in top]


# Takes the style-attribute dict of two tagged books (the same 10 keys as
# book_style_attributes; genre is not one of them - see DECISIONS.md).
# Returns (score, rationale): score is a similarity from 0 (nothing
# alike) to 1 (identical on every attribute), rationale is the sentence
# list from build_rationale. This is the one function the
# recommendations endpoint calls once per candidate book.
#
# An attribute that is None ("unknown") on either book is left out
# entirely - out of the distances and out of the weight total - so the
# score is a weighted average over the attributes both books actually
# have. Today only is_present_tense can be None: it's NULL for
# LLM-tagged books (see DECISIONS.md).
def similarity(attributes_a, attributes_b):
    known = [
        name for name in WEIGHTS
        if attributes_a[name] is not None and attributes_b[name] is not None
    ]
    distances = {
        name: attribute_distance(name, attributes_a[name], attributes_b[name])
        for name in known
    }
    total_weight = sum(WEIGHTS[name] for name in known)
    weighted_average_distance = (
        sum(WEIGHTS[name] * distances[name] for name in known) / total_weight
    )
    score = 1 - weighted_average_distance
    rationale = build_rationale(attributes_a, attributes_b, distances)
    return score, rationale
