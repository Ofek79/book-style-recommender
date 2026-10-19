# LLM auto-tagging evaluation

Two runs so far, both 2026-10-19, same model (`models/gemini-3.8-flash`), same 36-book catalog. Read the [Methodology note](#methodology-note) before trusting either run's numbers on their own.

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

## Practical conclusion (updated)

- `title_original` has not been tested yet - it was built to fix exactly the "well-known author, unrecognized Hebrew title" failure mode, but no book has actually had it filled in. Fill it in for קרבת דם and the other still-skipped books, then re-run (ideally 2-3 times, per the methodology note) before judging whether it works.
- `is_nonlinear`'s improvement (45% → 66%) looks like a real effect of the prompt fix, not noise, based on both the direction matching the hypothesis and the magnitude being well outside the ~0-15% noise band measured on unchanged attributes - but should still be confirmed with another run or two rather than treated as final.
- The attributes with strong, reliable surface signals (pov, sentence_length, has_humor) remain credible to lean on. The numeric attributes are close but noisy; `pacing`'s upward bias (noted in Run 1) hasn't been re-checked for direction in Run 2 and is worth revisiting once multi-run ranges are available.
