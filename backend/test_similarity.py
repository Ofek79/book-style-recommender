"""
Tests for similarity.py. Pure Python module, no database needed - run
with: cd backend && pytest
"""

import pytest

import similarity

# The two seed books used for the regression test below (see
# db/seed.sql): The Old Man and the Sea (id 1) and The Road (id 2),
# picked in the seed data specifically to come out close.
OLD_MAN_AND_THE_SEA = {
    "sentence_length": "short",
    "description_density": 2,
    "dialogue_ratio": "low",
    "pov": "third_limited",
    "is_present_tense": False,
    "tone": 3,
    "pacing": 2,
    "vocabulary_complexity": 2,
    "is_nonlinear": False,
    "has_humor": False,
}
THE_ROAD = {
    "sentence_length": "short",
    "description_density": 3,
    "dialogue_ratio": "low",
    "pov": "third_limited",
    "is_present_tense": False,
    "tone": 5,
    "pacing": 2,
    "vocabulary_complexity": 2,
    "is_nonlinear": False,
    "has_humor": False,
}

# --- attribute_distance -----------------------------------------------


# Takes nothing. Checks that a numeric attribute at opposite ends of the
# 1-5 scale distances to 1.0 - the normalization (/4) must not clip or
# overflow at the edges.
def test_attribute_distance_numeric_opposite_ends():
    assert similarity.attribute_distance("tone", 1, 5) == 1.0


# Takes nothing. Checks the normalization at a non-edge value, not just
# the extremes.
def test_attribute_distance_numeric_midpoint():
    assert similarity.attribute_distance("tone", 2, 4) == 0.5


# Takes nothing. Checks that an equal numeric attribute distances to 0.0.
def test_attribute_distance_numeric_equal():
    assert similarity.attribute_distance("tone", 3, 3) == 0.0


# Takes nothing. Checks the binary equal/different rule for categorical
# and boolean attributes, isolated from the numeric formula above.
def test_attribute_distance_categorical_equal_and_different():
    assert similarity.attribute_distance("pov", "first", "first") == 0.0
    assert similarity.attribute_distance("pov", "first", "third_omniscient") == 1.0


# --- describe_attribute -------------------------------------------------


# Takes nothing. Checks the exact rationale wording for a numeric (1-5)
# attribute: equal, and different in both directions - this text is what
# satisfies the product's "readable rationale" requirement, so the
# wording itself is worth locking down, not just "some string came back".
# The arguments are (picked book, recommended book), so 3 -> 5 means the
# recommendation is darker in tone.
def test_describe_attribute_numeric():
    assert similarity.describe_attribute("tone", 3, 3) == "האווירה בשניהם לא קלילה ולא כבדה."
    assert similarity.describe_attribute("tone", 3, 5) == "האווירה כאן כבדה יותר."
    assert similarity.describe_attribute("tone", 5, 3) == "האווירה כאן קלילה יותר."


# Takes nothing. Checks the exact wording for a boolean attribute, both
# when equal and when different - the "different" branch is the one
# describe_attribute gained after the original bug (assuming boolean
# attributes in the rationale are always equal). A different boolean is
# worded from the recommended book's side.
def test_describe_attribute_boolean():
    assert (
        similarity.describe_attribute("is_present_tense", True, True)
        == "גם כאן הסיפור מתרחש בזמן הווה."
    )
    assert (
        similarity.describe_attribute("is_present_tense", True, False)
        == "כאן הסיפור מסופר בזמן עבר, ולא בזמן הווה כמו בספר שבחרת."
    )


# Takes nothing. Checks the exact wording for pov, the one attribute
# with no order (so no "more" / "less"), equal and different.
def test_describe_attribute_pov():
    assert (
        similarity.describe_attribute("pov", "first", "first")
        == "בשניהם אחת הדמויות מספרת את הסיפור בגוף ראשון."
    )
    assert (
        similarity.describe_attribute("pov", "first", "third_omniscient")
        == "הספר שבחרת מסופר בגוף ראשון, וזה על ידי מספר שיודע הכול."
    )


# Takes a text-valued ordered attribute, the picked and recommended
# values, and the expected sentence. Checks that "more" / "less" follows
# TEXT_VALUE_ORDER (short < medium < long, low < medium < high) and not,
# say, alphabetical order of the stored strings - and that a one-step
# gap (low -> medium) reads the same as a big one.
@pytest.mark.parametrize(
    "name, picked, recommended, expected",
    [
        ("sentence_length", "short", "long", "המשפטים כאן ארוכים יותר מבספר שבחרת."),
        ("sentence_length", "long", "short", "המשפטים כאן קצרים יותר מבספר שבחרת."),
        ("dialogue_ratio", "low", "medium", "כאן יש יותר שיחות בין הדמויות."),
        ("dialogue_ratio", "high", "medium", "כאן הדמויות מדברות פחות מבספר שבחרת."),
    ],
)
def test_describe_attribute_more_less_follows_value_order(name, picked, recommended, expected):
    assert similarity.describe_attribute(name, picked, recommended) == expected


# --- build_rationale ------------------------------------------------------


# Takes nothing. Checks that build_rationale returns exactly
# RATIONALE_ATTRIBUTE_COUNT sentences, for the attributes with the
# smallest distances, closest first - the sorting/slicing logic itself,
# not just "some sentences came back".
def test_build_rationale_picks_closest_attributes_in_order():
    attrs = OLD_MAN_AND_THE_SEA  # attrs_a == attrs_b: every attribute reads as "equal"
    distances = {
        "sentence_length": 0.9,
        "description_density": 0.05,  # closest
        "dialogue_ratio": 0.9,
        "pov": 0.9,
        "is_present_tense": 0.9,
        "tone": 0.15,  # 3rd closest
        "pacing": 0.9,
        "vocabulary_complexity": 0.1,  # 2nd closest
        "is_nonlinear": 0.9,
        "has_humor": 0.9,
    }
    assert similarity.build_rationale(attrs, attrs, distances) == [
        "שני הספרים חסכוניים בתיאורים.",  # description_density 2
        "שניהם כתובים בשפה פשוטה.",  # vocabulary_complexity 2
        "האווירה בשניהם לא קלילה ולא כבדה.",  # tone 3
    ]


# --- similarity (end to end) ----------------------------------------------


# Takes nothing. Two identical attribute sets must score 1.0 (nothing
# differs) and still return a 3-sentence rationale.
def test_similarity_identical_books_scores_one():
    score, rationale = similarity.similarity(OLD_MAN_AND_THE_SEA, OLD_MAN_AND_THE_SEA)
    assert score == 1.0
    assert len(rationale) == 3


# Takes nothing. Two books differing as much as possible on every
# attribute must score 0.0 - the lower bound of the formula.
def test_similarity_maximally_different_books_scores_zero():
    attrs_a = {
        "sentence_length": "short",
        "description_density": 1,
        "dialogue_ratio": "low",
        "pov": "first",
        "is_present_tense": True,
        "tone": 1,
        "pacing": 1,
        "vocabulary_complexity": 1,
        "is_nonlinear": True,
        "has_humor": True,
    }
    attrs_b = {
        "sentence_length": "long",
        "description_density": 5,
        "dialogue_ratio": "high",
        "pov": "third_omniscient",
        "is_present_tense": False,
        "tone": 5,
        "pacing": 5,
        "vocabulary_complexity": 5,
        "is_nonlinear": False,
        "has_humor": False,
    }
    score, _ = similarity.similarity(attrs_a, attrs_b)
    assert score == 0.0


# Takes nothing. Regression test tied to the actual demo data: The Old
# Man and the Sea vs The Road were hand-picked in db/seed.sql to be a
# close pair, and this locks in the score and rationale shown in /docs
# during manual testing (see DECISIONS.md) so a future change to the
# formula can't silently break that demo without a test failing.
def test_similarity_known_seed_pair():
    score, rationale = similarity.similarity(OLD_MAN_AND_THE_SEA, THE_ROAD)
    assert score == pytest.approx(0.925)
    assert rationale == [
        "המשפטים קצרים וחסכוניים, כמו בספר שבחרת.",
        "גם כאן הדמויות מדברות מעט, ורוב הסיפור הוא תיאור ומחשבות.",
        "בשניהם עוקבים אחרי הסיפור דרך עיניה של דמות אחת.",
    ]


# Takes a monkeypatch fixture (from pytest, reverted automatically after
# the test). Raises the weight of has_humor - the one attribute that
# differs between two otherwise-identical books - and checks the score
# drops accordingly. Proves in code that a weight change (editing one
# entry in the WEIGHTS dict) actually changes the outcome, backing up
# the "one constant, easy to tune" claim in DECISIONS.md.
def test_similarity_respects_changed_weight(monkeypatch):
    attrs_a = dict(OLD_MAN_AND_THE_SEA, has_humor=False)
    attrs_b = dict(OLD_MAN_AND_THE_SEA, has_humor=True)

    baseline_score, _ = similarity.similarity(attrs_a, attrs_b)

    monkeypatch.setitem(similarity.WEIGHTS, "has_humor", 91)  # was 1; total weight becomes 100
    weighted_score, _ = similarity.similarity(attrs_a, attrs_b)

    assert weighted_score < baseline_score


# --- unknown (None) attributes ---------------------------------------------


# Takes the two is_present_tense values to use for the seed pair. An
# unknown value on either side - or on both - must drop the attribute
# from the score entirely: the average is over the 9 known attributes
# (description_density 0.25 + tone 0.5 = 0.75 / 9), not 10. The (None,
# None) case matters most: a plain == would read two unknowns as "equal"
# and pull LLM-tagged books toward each other (see DECISIONS.md).
@pytest.mark.parametrize(
    "present_a, present_b",
    [(None, False), (False, None), (None, None)],
)
def test_similarity_unknown_attribute_left_out_of_score(present_a, present_b):
    attrs_a = dict(OLD_MAN_AND_THE_SEA, is_present_tense=present_a)
    attrs_b = dict(THE_ROAD, is_present_tense=present_b)
    score, _ = similarity.similarity(attrs_a, attrs_b)
    assert score == pytest.approx(1 - 0.75 / 9)


# Takes nothing. Two books that differ on every known attribute, with
# is_present_tense unknown on both: the rationale must still have 3
# sentences, none of them about tense, and the score must be 0.0 over the
# 9 known attributes. With a plain ==, None == None would make tense the
# "closest" attribute and put it first in the rationale.
def test_similarity_unknown_attribute_never_in_rationale():
    attrs_a = {
        "sentence_length": "short",
        "description_density": 1,
        "dialogue_ratio": "low",
        "pov": "first",
        "is_present_tense": None,
        "tone": 1,
        "pacing": 1,
        "vocabulary_complexity": 1,
        "is_nonlinear": True,
        "has_humor": True,
    }
    attrs_b = {
        "sentence_length": "long",
        "description_density": 5,
        "dialogue_ratio": "high",
        "pov": "third_omniscient",
        "is_present_tense": None,
        "tone": 5,
        "pacing": 5,
        "vocabulary_complexity": 5,
        "is_nonlinear": False,
        "has_humor": False,
    }
    score, rationale = similarity.similarity(attrs_a, attrs_b)
    assert score == 0.0
    assert len(rationale) == 3
    # Every sentence describe_attribute can produce for tense. Compared as
    # whole sentences, not by searching for a word like "זמן", since other
    # attributes' sentences use it too (pacing: "לוקחים את הזמן").
    tense_sentences = set(similarity.SAME_VALUE_SENTENCES["is_present_tense"].values()) | set(
        similarity.BOOLEAN_DIFFERENT_SENTENCES["is_present_tense"].values()
    )
    assert not any(sentence in tense_sentences for sentence in rationale)
