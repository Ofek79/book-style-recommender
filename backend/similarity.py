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

# ---- Rationale wording ---------------------------------------------------
#
# Rationale sentences are user-facing, so they are in Hebrew (see
# DECISIONS.md); names, comments, and everything else in this file stay
# English. They are written the way a reader would say it to a friend,
# with no numbers and no system terms (see DECISIONS.md). Every sentence
# compares two books: the one the reader picked (value_a) and the
# recommended one shown on the card (value_b, "here" - "כאן").
#
# The four attributes that appear in almost every rationale -
# sentence_length, description_density, dialogue_ratio, pov - each start
# their sentence differently, so a card's three lines never all open the
# same way.

# Sentence for when both books have the same value. Keyed by attribute,
# then by the stored value (English in the database, numbers for the 1-5
# scales).
SAME_VALUE_SENTENCES = {
    "sentence_length": {
        "short": "המשפטים קצרים וחסכוניים, כמו בספר שבחרת.",
        "medium": "המשפטים באורך רגיל, לא קצרים ולא ארוכים, כמו בספר שבחרת.",
        "long": "המשפטים ארוכים וזורמים, כמו בספר שבחרת.",
    },
    "description_density": {
        1: "שני הספרים כמעט בלי תיאורים - הכול עלילה ושיחות.",
        2: "שני הספרים חסכוניים בתיאורים.",
        3: "שני הספרים מתארים במידה, בלי להעמיס.",
        4: "שני הספרים עשירים בתיאורים.",
        5: "שני הספרים מלאים בתיאורים מפורטים.",
    },
    "dialogue_ratio": {
        "low": "גם כאן הדמויות מדברות מעט, ורוב הסיפור הוא תיאור ומחשבות.",
        "medium": "גם כאן יש איזון טוב בין שיחות לסיפור.",
        "high": "גם כאן הסיפור מתקדם הרבה דרך שיחות בין הדמויות.",
    },
    "pov": {
        "first": "בשניהם אחת הדמויות מספרת את הסיפור בגוף ראשון.",
        "third_limited": "בשניהם עוקבים אחרי הסיפור דרך עיניה של דמות אחת.",
        "third_omniscient": "בשניהם יש מספר שיודע הכול ורואה את כל הדמויות.",
        "second": "בשניהם הסיפור פונה אל הקורא בגוף שני.",
    },
    "is_present_tense": {
        True: "גם כאן הסיפור מתרחש בזמן הווה.",
        False: "כמו בספר שבחרת, גם כאן הסיפור מסופר בזמן עבר.",
    },
    "tone": {
        1: "שניהם קלילים ומשעשעים באווירה.",
        2: "האווירה בשניהם די קלילה.",
        3: "האווירה בשניהם לא קלילה ולא כבדה.",
        4: "לשניהם אווירה רצינית ודי כבדה.",
        5: "שניהם אפלים וכבדים.",
    },
    "pacing": {
        1: "שניהם לוקחים את הזמן - קצב איטי ומהורהר.",
        2: "הקצב בשניהם די רגוע.",
        3: "הקצב בשניהם מאוזן.",
        4: "שניהם מתקדמים בקצב מהיר.",
        5: "שניהם דוהרים קדימה, עם אירוע אחרי אירוע.",
    },
    "vocabulary_complexity": {
        1: "השפה בשניהם פשוטה מאוד ונגישה.",
        2: "שניהם כתובים בשפה פשוטה.",
        3: "השפה בשניהם יומיומית, לא פשוטה ולא גבוהה.",
        4: "שניהם כתובים בשפה עשירה.",
        5: "שניהם כתובים בשפה גבוהה וספרותית.",
    },
    "is_nonlinear": {
        True: "שניהם קופצים בין זמנים ולא מספרים לפי הסדר.",
        False: "שני הסיפורים נפרשים לפי סדר הזמן.",
    },
    "has_humor": {
        True: "בשניהם יש חוש הומור.",
        False: "שניהם רציניים, בלי הומור.",
    },
}

# For attributes whose values have a natural order, a difference is one
# comparative sentence about the recommended book: (sentence if it has
# MORE than the picked book, sentence if it has LESS). "More" works the
# same whether the gap is one step or four, so close and far differences
# read naturally with one rule.
MORE_LESS_SENTENCES = {
    "sentence_length": ("המשפטים כאן ארוכים יותר מבספר שבחרת.", "המשפטים כאן קצרים יותר מבספר שבחרת."),
    "description_density": ("הספר הזה עשיר יותר בתיאורים.", "כאן יש פחות תיאורים מבספר שבחרת."),
    "dialogue_ratio": ("כאן יש יותר שיחות בין הדמויות.", "כאן הדמויות מדברות פחות מבספר שבחרת."),
    "tone": ("האווירה כאן כבדה יותר.", "האווירה כאן קלילה יותר."),
    "pacing": ("הקצב כאן מהיר יותר.", "הקצב כאן איטי יותר."),
    "vocabulary_complexity": ("השפה כאן עשירה יותר.", "השפה כאן פשוטה יותר."),
}

# Order of the two text-valued ordered attributes, lowest first, so
# "more" and "less" can be worked out for them. The 1-5 attributes are
# already ordered by their number.
TEXT_VALUE_ORDER = {
    "sentence_length": ["short", "medium", "long"],
    "dialogue_ratio": ["low", "medium", "high"],
}

# How each point of view is worded inside a "picked book vs. this one"
# sentence - pov has no order, so it can't use "more" / "less".
POV_PHRASES = {
    "first": "בגוף ראשון",
    "third_limited": "דרך עיניה של דמות אחת",
    "third_omniscient": "על ידי מספר שיודע הכול",
    "second": "בגוף שני",
}

# Sentence for a boolean attribute that differs, keyed by the
# recommended book's value (the picked book's value is then the other one).
BOOLEAN_DIFFERENT_SENTENCES = {
    "is_present_tense": {
        True: "כאן הסיפור מסופר בזמן הווה, ולא בזמן עבר כמו בספר שבחרת.",
        False: "כאן הסיפור מסופר בזמן עבר, ולא בזמן הווה כמו בספר שבחרת.",
    },
    "is_nonlinear": {
        True: "כאן העלילה קופצת בזמן, בניגוד לספר שבחרת.",
        False: "כאן העלילה מסופרת לפי הסדר, בלי הקפיצות בזמן של הספר שבחרת.",
    },
    "has_humor": {
        True: "כאן יש הומור, שלא היה בספר שבחרת.",
        False: "כאן אין את ההומור של הספר שבחרת.",
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


# Takes one attribute's name, its value in the picked book (value_a) and
# in the recommended book (value_b). Returns one natural sentence
# comparing the two (equal or different both get a sentence - "closest"
# attributes can still differ when two books have little in common).
# Exists to turn a raw attribute pair into the wording used in a
# rationale. Order matters: value_a must be the picked book, since the
# sentences say "here" (the recommendation) vs. "the book you picked".
def describe_attribute(name, value_a, value_b):
    if value_a == value_b:
        return SAME_VALUE_SENTENCES[name][value_a]
    if name in MORE_LESS_SENTENCES:
        more_sentence, less_sentence = MORE_LESS_SENTENCES[name]
        if name in TEXT_VALUE_ORDER:
            order = TEXT_VALUE_ORDER[name]
            recommended_has_more = order.index(value_b) > order.index(value_a)
        else:
            recommended_has_more = value_b > value_a
        return more_sentence if recommended_has_more else less_sentence
    if name == "pov":
        return f"הספר שבחרת מסופר {POV_PHRASES[value_a]}, וזה {POV_PHRASES[value_b]}."
    # The rest are booleans (is_present_tense, is_nonlinear, has_humor).
    return BOOLEAN_DIFFERENT_SENTENCES[name][value_b]


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
