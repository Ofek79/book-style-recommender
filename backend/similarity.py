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
ATTRIBUTE_LABELS = {
    "sentence_length": "sentence length",
    "description_density": "description density",
    "dialogue_ratio": "dialogue ratio",
    "pov": "point of view",
    "is_present_tense": "tense",
    "tone": "tone",
    "pacing": "pacing",
    "vocabulary_complexity": "vocabulary complexity",
    "is_nonlinear": "story structure",
    "has_humor": "humor",
}

# How to word True/False for each boolean attribute in a sentence.
BOOLEAN_LABELS = {
    "is_present_tense": {True: "present tense", False: "past tense"},
    "is_nonlinear": {True: "a nonlinear structure", False: "a linear structure"},
    "has_humor": {True: "humor", False: "no humor"},
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
            return f"Both have the same {label} ({value_a})."
        return f"Similar {label} ({value_a} vs {value_b})."
    if name in BOOLEAN_LABELS:
        if value_a == value_b:
            return f"Both have {BOOLEAN_LABELS[name][value_a]}."
        return f"Differ in {label}: {BOOLEAN_LABELS[name][value_a]} vs {BOOLEAN_LABELS[name][value_b]}."
    # Remaining attributes are plain categorical text (sentence_length,
    # dialogue_ratio, pov).
    if value_a == value_b:
        return f"Both are {value_a} in {label}."
    return f"Differ in {label}: {value_a} vs {value_b}."


# Takes the two books' attribute dicts and the per-attribute distances
# already computed for them. Returns a list of RATIONALE_ATTRIBUTE_COUNT
# sentences, for the attributes where the books are closest, closest
# first. Exists to satisfy the product's hard requirement that every
# recommendation comes back with a readable rationale, not just a score.
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
def similarity(attributes_a, attributes_b):
    distances = {
        name: attribute_distance(name, attributes_a[name], attributes_b[name])
        for name in WEIGHTS
    }
    total_weight = sum(WEIGHTS.values())
    weighted_average_distance = (
        sum(WEIGHTS[name] * distances[name] for name in WEIGHTS) / total_weight
    )
    score = 1 - weighted_average_distance
    rationale = build_rationale(attributes_a, attributes_b, distances)
    return score, rationale
