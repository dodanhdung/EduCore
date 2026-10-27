# R9.4 OTP timing power and error analysis — owner review

This calculation supports the **proposed** protocol in `R9_04_OTP_MEASUREMENT_PROTOCOL.md`; it does not change the official gate. Reproducible aggregate inputs/results are in `R9_04_OTP_MEASUREMENT_EVIDENCE.json`. Calculations were run with local Node `v24.12.0`, using a normal-CDF approximation. No PostgreSQL/HTTP diagnostic was run for this document.

## Statistical model and its limits

For independent continuous known and unknown latencies with `n` per group under identical distributions, the Mann–Whitney AUC estimator has approximate null variance `(2n+1)/(12n²)`. This assumes no ties, no temporal dependence, no matching/slot effects and no run-to-run shifts. It is a **reference**, not a calibrated variance for the current block experiment. Approximate 95% CI half-width is `1.959964 × sqrt(variance × D)`, where `D` is a sensitivity design effect (1 = i.i.d.; 2 = twice the variance). Positive block/shared-load covariance can either increase or decrease variance of the balanced contrast, depending on the covariance structure; `D=2` is a planning sensitivity, not a measured bound.

Let `m=.05`, true signed AUC offset `d=AUC-.5`, and standard error `s`. A normal 95% interval lies wholly in the present band only when `|estimate-.5| < m-1.959964s` (boundary equality has negligible probability). With `Z` standard normal, the approximate containment power is

`Φ((m-1.959964s-d)/s) - Φ((-m+1.959964s-d)/s)` when `m>1.959964s`, otherwise zero. The detection power for a two-sided 5% equality test is `1-Φ(1.959964-d/s)+Φ(-1.959964-d/s)`. Solve by integer search for the smallest `n` that reaches a target. These expressions deliberately assume known `s`; finite-block percentile bootstrap coverage may differ. A balanced, stratified or repeated-IP design needs its own variance calibration before accepting these sample sizes.

## Reference numbers per condition

| `n` per label | `D` | SE at AUC .5 | 95% half-width | Equivalence power at true .50 | Equivalence power at true .52 |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 400 | 1 | .02043 | .04003 | 37.4% | 24.0% |
| 400 | 2 | .02889 | .05661 | 0% in this normal model | 0% |
| 700 | 1 | .01544 | .03025 | 79.9% | 48.8% |
| 1,000 | 1 | .01291 | .02531 | 94.4% | 64.2% |
| 2,400 | 2 | .01179 | .02310 | 97.8% | 72.1% |

At 400/group with `D=1`, a genuinely centered implementation can therefore fail interval containment about **62.6%** of the time in one condition; under independence across three, the probability that at least one fails is about **94.7%**. This is a sensitivity calculation, **not** an estimate of the actual current test's false rejection rate. The observed bootstrap widths are narrower than this simple i.i.d. reference and conditions share infrastructure, so actual joint failure probability could be substantially different. Under `D=2`, a symmetric 95% normal interval is wider than the .10 equivalence band at n=400 and containment is impossible in that approximation.

| True AUC | Target power | `n`/label for one condition, `D=1` | `n`/label for all 3, independent conditions, `D=1` | `n`/label for one condition, `D=2` | `n`/label for all 3, independent conditions, `D=2` |
| ---: | ---: | ---: | ---: | ---: | ---: |
| .50 | 80% | 701 | 944 | 1,402 | 1,887 |
| .50 | 90% | 867 | 1,108 | 1,734 | 2,214 |
| .52 | 80% | 1,455 | 2,171 | 2,908 | 4,341 |
| .52 | 90% | 1,947 | 2,645 | 3,893 | 5,288 |

The all-three columns cube single-cell power **only under independent conditions**. The current suite shares Node, DB, worker and sequence, so this is a reference scenario. At the proposed C1 size of 2,400/label/condition with `D=2` and true AUC .50, the model gives about 93.4% all-three containment if conditions are independent. Requiring two independent such runs to pass would lower this to about 87.3%; that is why C2 is proposed as a disclosed replication requiring review, not an opportunistic substitute or an unapproved second gate. With true AUC .52, C1 all-three reference power is only about 37.5% under `D=2`; a border-near but still equivalent system can be expensive to certify. A 90%-power all-three target for true AUC .52 and `D=2` needs roughly 5,288/label/condition (about twice the 2,645 i.i.d. count), subject to actual design calibration.

## Error rates and multiple conditions

The 95% CI containment rule is more conservative than the conventional two one-sided tests (TOST) at 5%, which use a 90% two-sided CI. Assuming valid marginal 95% coverage and a true AUC at or beyond either boundary, false equivalence in that condition is at most about **2.5%** at the boundary. Because **all three** conditions must pass, the intersection-union rule bounds false acceptance for any false condition by the worst offending marginal rate; Bonferroni correction is not required solely to claim all three are equivalent. That does not account for misspecified/bootstrap undercoverage, untested deployment conditions, response-shape errors or attacker strategy. If instead one hunts for *any* significant difference among three independent conditions using 5% two-sided tests, family false-alarm probability rises to `1-.95³ = 14.26%`; use prespecified family control or label individual findings exploratory. Simultaneous 95% descriptive intervals across three would use about 98.33% marginal coverage with Bonferroni and have wider intervals, increasing false rejection. The official test uses neither adjustment; no adjustment was made here.

False rejection means a genuinely in-band implementation cannot meet whole-interval containment because of sampling uncertainty, environmental variance or multiple required cells. False acceptance means an out-of-band implementation is declared equivalent because the interval method undercovers, the actual attack conditions were omitted, or the sample happened to be favorable. Optional stopping and repeated fresh clusters until one passes increase false acceptance well beyond the nominal rule. The prior three runs are **historical observations** for diagnosis; they cannot be combined into an unplanned acceptance attempt or used to select only a favorable condition. A fixed sample, fixed seeds, all-result reporting and independent deployment-like validation are essential.

## Relation to observed intervals and attacker budget

At n=400/group, the simple i.i.d. null model predicts a 95% CI width about .0801. The nine observed percentile widths span **.0535–.0669**. Balanced within-block shared jitter could reduce contrast variance; a block bootstrap that misses cross-block dependence could also understate uncertainty. Width alone cannot distinguish them. The three runs all use the same source test; two tested pre-HEAD code states, and one tested the later committed test fix. Treat them as different environments/source states, not 2,400 independent requests per label. All four failed AUC intervals contain .5; thus neither a meaningful AUC side channel nor absence of one is established by these intervals.

The route's 10 requests/IP/minute throttle means the 400/label/condition test samples require many test IPs and unique fixture addresses. AUC .55 could be consequential to a distributed attacker but may yield little practical power to a single-IP attacker facing drift and known-address suppression. Quantifying actual classifier success requires a frozen attack simulation under the real proxy/IP budget, calibration controls and deployment network noise. No such simulation was run. The 100 ms response floor may hide the 0.90–1.25 ms internal median gap during normal service, yet DB/pool/worker tails could overrun it. The proposed diagnostic explicitly measures that tail, because a central AUC band alone cannot rule out rare but distinguishable overrun events.

## Reproduction recipe

For each `n`, compute `s=sqrt((2n+1)/(12n*n)*D)` and the formulas above. Use standard normal CDF `Φ(z)=0.5*(1+erf(z/sqrt(2)))`, critical value `1.9599639845`, and increment integer `n` until target power is reached. The JSON stores the exact inputs and rounded results. Recompute with a tested numerical library for any formal owner-approved sample-size contract.
