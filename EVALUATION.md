# LLM auto-tagging evaluation

Two full runs, both 2026-10-19, same model (`models/gemini-3.8-flash`), same 36-book catalog, plus one targeted 8-book experiment on 2026-10-20 ([`title_original` vs. `is_present_tense`](#experiment-title_original-vs-is_present_tense-2026-10-20)). Read the [Methodology note](#methodology-note) before trusting either run's numbers on their own.

## Run 1 (baseline, before the `is_nonlinear` prompt fix)

- **Books:** 36 tagged total. 29 compared, 7 skipped (`unknown_book`) - all 7 skips were Hebrew-titled books; 0 of 29 compared books were.

| Attribute | Exact match | Within ±1 (numeric only) |
| --- | --- | --- |
| pov | 86% | — |
| sentence_length | 83% | — |
| has_humor | 83% | — |
| is_present_tense | 76% | — |
| dialogue_ratio | 69% | — |
| tone | 66% | 90% |
| vocabulary_complexity | 59% | 90% |
| description_density | 52% | 97% |
| is_nonlinear | 45% | — |
| pacing | 41% | 90% |

**Findings from this run:**
- Splitting `is_nonlinear` by language found 76% agreement on English-titled books vs. **0/12** on Hebrew ones - 10 of those 12 were the model saying "nonlinear" where the manual tag said "linear." The Hebrew catalog is mostly commercial thrillers that alternate POV between short chapters in otherwise chronological order; the two books both sides agreed were nonlinear (*Slaughterhouse-Five*, *One Hundred Years of Solitude*) are genuinely timeline-scrambled. This is what led to tightening the prompt wording (see `DECISIONS.md`, 2026-10-19).
- `pacing` had a systematic upward bias: mean signed difference (LLM − manual) = **+0.55**, almost entirely 0/+1/+2, essentially never negative - not random noise, a real calibration skew.
- All 7 skips were Hebrew-titled, including **קרבת דם** by הרלן קובן (Harlan Coben) - a well-known author, just not recognized under a Hebrew title the model may never have seen paired with his name. This led to adding `title_original` (see `DECISIONS.md`, 2026-10-19).

## Run 2 (after the `is_nonlinear` prompt fix)

- **What changed since Run 1:** the `is_nonlinear` prompt wording was tightened (alternating POV explicitly excluded from the definition). Separately, the `author` field for 3 Harlan Coben books was changed from Hebrew to English between runs - **`title_original` was not actually filled in for any book** (checked directly against the database - see below), so the `title_original` fix itself has not been tested yet.
- **Books:** 29 compared, 7 skipped - a *different* 7 than Run 1: **לכולנו יש סודות** and **שקרים פשוטים** newly skipped; **פרקליטו של השטן** and **המושבעים** newly recognized. Checked directly: none of these 4 books' `author`/`title_original` changed between runs - same input, different recognition outcome both times.

| Attribute | Exact match | Within ±1 (numeric only) | vs. Run 1 |
| --- | --- | --- | --- |
| pov | 86% | — | same |
| has_humor | 86% | — | +3 |
| sentence_length | 83% | — | same |
| is_nonlinear | 66% | — | **+21** |
| is_present_tense | 72% | — | -4 |
| dialogue_ratio | 55% | — | -14 |
| tone | 62% | 86% | -4 / -4 |
| vocabulary_complexity | 59% | 97% | same / +7 |
| pacing | 52% | 86% | +11 / -4 |
| description_density | 48% | 93% | -4 / -4 |

**`is_nonlinear` went from 45% to 66%** - consistent with the prompt fix working, not just noise (see below for why this one is more likely a real improvement than the others are real regressions).

**Still skipped as `unknown_book` after the fix (checked `title_original`/`author` directly in the database for each):**

| Title | `author` | `title_original` |
| --- | --- | --- |
| Nobody's fool | Harlan Coben | *(empty)* |
| המלך דוד | שרון חיון גינת | *(empty)* |
| לכולנו יש סודות | ג'יין קורי | *(empty)* |
| סטילר | שרון חיון גינת | *(empty)* |
| עמנואל | שרון חיון גינת | *(empty)* |
| **קרבת דם** | **Harlan Coben** | *(empty)* |
| שקרים פשוטים | דיוויד בלאצ'י | *(empty)* |

**`title_original` is empty for every one of these, including קרבת דם.** The `author` field was changed to English for the 3 Coben books, which was enough for two of them (אני אמצא אותך, תחשוב פעמיים - both recognized in both runs) but not for קרבת דם. The `title_original` feature itself has not been exercised at all yet - it has not failed, it has simply never been given a value to test with.

## Non-determinism finding

Five attributes read lower in Run 2 than Run 1. Before concluding anything was tuned badly, this was checked directly rather than assumed:

**Of the 27 books compared in *both* runs with *identical* input** (same `author`, same empty `title_original`, same prompt wording for every attribute except `is_nonlinear`), how often did Gemini give a *different* answer the second time, on the exact same book with the exact same question:

| Attribute | Answers that changed between runs |
| --- | --- |
| sentence_length | 0/27 (0%) |
| pov | 1/27 (4%) |
| has_humor | 1/27 (4%) |
| is_present_tense | 2/27 (7%) |
| vocabulary_complexity | 2/27 (7%) |
| dialogue_ratio | 3/27 (11%) |
| tone | 3/27 (11%) |
| description_density | 4/27 (15%) |
| pacing | 4/27 (15%) |
| is_nonlinear | 6/27 (22%) |

Nothing about these 27 books' inputs changed between calls - this is Gemini giving a different answer to the identical question asked twice, 7-15% of the time, for every attribute whose wording was never touched. Separately, recognition itself is also non-deterministic: 2 books flipped from recognized → `unknown_book` and 2 flipped the other way, with zero change to their data either time.

**Conclusion: this is sampling noise, not a regression or a bug.** `is_nonlinear`'s 22% drift is the one exception worth reading differently - its prompt wording *was* deliberately changed, so part of that number is the intended effect of the fix, not just noise (and its *aggregate* score moved from 45% to 66%, in the predicted direction, which plain noise on an unchanged attribute would be unlikely to produce). The other nine attributes' drift (0-15%) is the honest noise floor of this measurement method itself.

## Methodology note

A single run over 29 books is small enough that normal sampling noise moves individual attribute percentages by a meaningful amount run to run - the comparison above shows 7-15% drift on attributes nobody touched, just from calling the same prompt twice. **Treat any single run's exact percentage as a rough estimate, not a precise score.** Before concluding a change helped or hurt, run `compare_llm_tagging.py` 2-3 times and look at the range (or mean) across runs, not one number - especially for attributes already close to this method's own noise floor, or for small differences between two runs (a handful of points either way is within the noise seen here).

## Experiment: `title_original` vs. `is_present_tense` (2026-10-20)

**Why it was run:** After the 100-book LLM bulk tagging, manually-tagged books were recommended almost only other manually-tagged books. Diagnosis found two attributes driving most of that split, `is_present_tense` and `is_nonlinear`. On the 29 books Run 2 compared, every `is_present_tense` disagreement went one way: **8/8 were manual = present, LLM = past**, with 0 the other way. The tagger then checked all 8 books against the actual text: **all 8 are present tense.** The manual tags were right and the model was wrong on every one.

**Hypothesis tested:** these are recognition failures, not definition failures. All 8 are Hebrew-titled thrillers that had no `title_original` at Run 2 time, so the model may have recognized the author but not the specific book, and guessed the common case (past).

**Setup:** `title_original` filled for the 6 of the 8 that lacked it (2 already had one). Each book tagged **twice in the same session**, once without `title_original` and once with it, so prompt wording, model, and `temperature=0` were identical between the two calls and only `title_original` differed. `author` deliberately left unchanged, to keep one variable. 16 calls (17 sent - one `504` retried automatically). Nothing was written to `book_style_attributes`.

| Book | `title_original` | Manual | Without | With |
| --- | --- | --- | --- | --- |
| הנאשמות | Fifty Fifty | present | past | past |
| פרקליטו של השטן | The Devil's Advocate | present | past | past |
| אני אמצא אותך | I Will Find You | present | past | past |
| תחשוב פעמיים | Think Twice | present | past | past |
| המושבעים | Thirteen | present | `unknown_book` | past |
| הבתולות | The Maidens | present | past | past |
| עוזרת הבית | The Housemaid | present | present | past |
| רוחות הזעם | The Fury | present | past | past |

**Result: hypothesis rejected.** `is_present_tense` was right on 1/8 without `title_original` and **0/8 with it**. `title_original` did help recognition (המושבעים went from `unknown_book` to tagged), and overall 10-attribute agreement barely moved (one book up 4→6, one down 4→3, the rest unchanged). So the model recognizes these books and still says past tense.

**Conclusion:** grammatical tense is a text-level detail the model does not reliably know from a title and author, and when unsure it defaults to past, the common case. *The Housemaid* is present tense in the English original too, so "the Hebrew translation changed the tense" does not explain it. Rewording the prompt is unlikely to help, because wording can't supply knowledge the model doesn't have. **Decision: `is_present_tense` is tagged manually only, and treated as unknown for LLM-tagged books** (see `DECISIONS.md`).

**Limits:** 8 books is a small sample, but 0/8, all wrong in the same direction, on books the tagger verified against the text, is a clear enough pattern to drop the attribute from auto-tagging. It does not say the model's `False` answers on the other 100 books are wrong - only that they can't be trusted. Their distribution (12/100 present) is plausible for a catalog of mostly classics and literary fiction, and every book tagged present looks correct.

## Practical conclusion (updated)

- `is_present_tense` is not reliable from LLM auto-tagging (see the experiment above) - manual only.
- `title_original` has now been tested on 8 books: it helps recognition (1 book went from `unknown_book` to tagged) but does not fix attributes the model simply doesn't know. It still hasn't been tried on the other `unknown_book` books listed above (קרבת דם and the rest).
- `is_nonlinear`'s improvement (45% → 66%) looks like a real effect of the prompt fix, not noise, based on both the direction matching the hypothesis and the magnitude being well outside the ~0-15% noise band measured on unchanged attributes - but should still be confirmed with another run or two rather than treated as final.
- The attributes with strong, reliable surface signals (pov, sentence_length, has_humor) remain credible to lean on. The numeric attributes are close but noisy; `pacing`'s upward bias (noted in Run 1) hasn't been re-checked for direction in Run 2 and is worth revisiting once multi-run ranges are available.
