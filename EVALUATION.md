# LLM auto-tagging evaluation

Three full runs over the same 36 manually-tagged books, same model (`models/gemini-3.8-flash`): Runs 1-2 on 2026-10-19, [Run 3](#run-3-2026-10-22-after-is_present_tense-left-auto-tagging) on 2026-10-22. Plus one targeted 8-book experiment on 2026-10-20 ([`title_original` vs. `is_present_tense`](#experiment-title_original-vs-is_present_tense-2026-10-20)). Read the [Methodology note](#methodology-note) before trusting either run's numbers on their own.

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

## Run 3 (2026-10-22, after `is_present_tense` left auto-tagging)

**What changed since Run 2** - several things at once, so differences from Run 2 can't be pinned on any single one:
- `is_present_tense` is no longer asked of the model (see the experiment above and `DECISIONS.md`). It shows as "not compared".
- First full run at `temperature=0`. Run 2 ran at the model's default `temperature=1.0` (the `temperature` change in `DECISIONS.md` came after Run 2).
- `title_original` filled in for 9 of the Hebrew-titled books (the 8 from the experiment, plus קרבת דם → *Caught*).
- One manual tag corrected: הבתולות `is_nonlinear` false → true (the tagger re-checked the book). The model said true, so that one book moved from disagree to agree because the manual tag changed, not the model.
- The comparison set is now picked by `tagged_by = 'manual'` instead of "every tagged book" (see `DECISIONS.md`). Same 36 books as Runs 1-2. The 100 LLM-tagged books are correctly left out.

**Books:** 32 compared, 4 skipped (all `unknown_book`), against 29 / 7 in Run 2. Newly recognized: קרבת דם (now has `title_original`), לכולנו יש סודות and שקרים פשוטים (no `title_original` - these two already flipped between Runs 1 and 2, so this may be noise or `temperature=0`, not a fix). Because 3 extra books are counted, percentages aren't strictly comparable to Run 2.

| Attribute | Exact match | Within ±1 (numeric only) | vs. Run 2 |
| --- | --- | --- | --- |
| has_humor | 88% | — | +2 |
| pov | 84% | — | -2 |
| sentence_length | 81% | — | -2 |
| dialogue_ratio | 62% | — | +7 |
| is_nonlinear | 62% | — | -4 |
| vocabulary_complexity | 56% | 97% | -3 / same |
| description_density | 53% | 94% | +5 / +1 |
| tone | 53% | 88% | -9 / +2 |
| pacing | 47% | 81% | -5 / -5 |
| is_present_tense | not compared | — | removed from auto-tagging |

**`is_nonlinear` across runs: 45% → 66% → 62%.** The prompt fix happened between Runs 1 and 2, so the real jump is Run 1 → Run 2 (+21). Run 2 → Run 3 (-4) is within the noise band measured above. Comparing Run 1 directly to Run 3 (+17) is accurate as a total, but mixes the prompt fix with everything else that changed since.

**`is_nonlinear` still has a one-way bias.** Of the 12 disagreements, **10 are manual = false, LLM = true** (*The Road*, *The Da Vinci Code*, עוזרת הבית, הקולגה, רוחות הזעם, and others). Only 2 go the other way. That's the same shape as the `is_present_tense` failure: not random noise, but the model systematically reading these books as nonlinear where the manual tagger doesn't. Unlike tense, this could still be a definition gap, not missing knowledge - not tested yet.

**Every other move is within the noise band** (0-15% per-answer drift between identical calls, see above). `tone` -9 is the largest. Don't read it as a regression without another run.

**The 4 skipped books:**

| Title | `author` | `title_original` | Likely reason |
| --- | --- | --- | --- |
| סטילר | שרון חיון גינת | *(empty)* | Israeli author writing in Hebrew - there's no original-language title to give. The model likely doesn't know her books at all. `title_original` can't fix this. |
| עמנואל | שרון חיון גינת | *(empty)* | Same as above. |
| המלך דוד | שרון חיון גינת | *(empty)* | Same as above. |
| Nobody's fool | Harlan Coben | *(empty)* | Too recent. The book is real - verified by the tagger: published March 2025, book 2 of Coben's Sami Kierce series, ~53k Goodreads ratings. (A first draft of this table wrongly called it a likely data error.) Probably too new for the model's training data to cover well. |

## Practical conclusion (updated)

- `is_present_tense` is not reliable from LLM auto-tagging (see the experiment above) - manual only.
- `is_nonlinear` is the next candidate for the same kind of check: 62%, with disagreements running 10-to-2 in one direction.
- **Auto-tagging is unreliable for recently published books, not only niche ones.** *Nobody's Fool* (Harlan Coben, March 2025) is a bestselling author's widely-read book, yet it comes back `unknown_book` - most likely because it's newer than most of what the model learned from. So "the model doesn't recognize it" has at least two different causes in this catalog: books it was never likely to see (local Hebrew-language authors like שרון חיון גינת), and books too recent to be well covered. `title_original` helps with neither. This is an inferred explanation, not a tested one - the model's training cutoff isn't documented here. For a new release, plan on tagging it by hand.
- `title_original` has now been tested on 8 books: it helps recognition (1 book went from `unknown_book` to tagged) but does not fix attributes the model simply doesn't know. In Run 3, קרבת דם (given *Caught*) was recognized for the first time, which fits that - though `temperature=0` changed in the same run. The 3 שרון חיון גינת books are original Hebrew works, so `title_original` doesn't apply to them.
- `is_nonlinear`'s improvement (45% → 66%) looks like a real effect of the prompt fix, not noise, based on both the direction matching the hypothesis and the magnitude being well outside the ~0-15% noise band measured on unchanged attributes - but should still be confirmed with another run or two rather than treated as final.
- The attributes with strong, reliable surface signals (pov, sentence_length, has_humor) remain credible to lean on. The numeric attributes are close but noisy; `pacing`'s upward bias (noted in Run 1) hasn't been re-checked for direction in Run 2 and is worth revisiting once multi-run ranges are available.
