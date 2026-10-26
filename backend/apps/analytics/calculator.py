"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Latency Percentile Calculator
===================================================================================
PURPOSE:
    This module provides mathematically sound percentile calculations for ingress
    latency distributions (p50, p95, p99, and max).

FIRST PRINCIPLES: WHY AVERAGES ARE DANGEROUS FOR SLA METRICS:
    - In high-throughput ingestion systems, 95% of requests might complete in 20ms,
      while 5% suffer GC pauses or lock contention and take 800ms.
    - Arithmetic Mean (Average) obscures tail latency anomalies.
    - An "average of averages" across rollup windows is statistically invalid.
    - SignalBridge requires genuine percentile ranking derived directly from the
      sample distribution.

PERCENTILE COMPUTATION ALGORITHM (Nearest-Rank Method):
    Given an ascending sorted array of N latency samples: L = [l_0, l_1, ..., l_{N-1}]
    For a target percentile P (e.g. P = 95):
        Rank index: k = max(0, min(N - 1, math.ceil((P / 100.0) * N) - 1))
        Value: L[k]

EXACT VS. ESTIMATED PERCENTILES:
    - EXACT: When total window throughput N <= MAX_SAMPLES_PER_WINDOW (1,000 samples/min),
      all samples are captured in full fidelity. The calculated percentiles are EXACT.
    - ESTIMATED: When throughput exceeds 1,000 samples/min (> 16.6 req/sec), the list
      retains the latest 1,000 samples (bounded moving reservoir). The calculated
      percentiles are statistically accurate estimates representing tail latency over
      the sample population.
===================================================================================
"""
import math
from typing import Dict, List, Union


def calculate_percentiles(samples: List[Union[int, float]]) -> Dict[str, float]:
    """
    Computes p50, p95, p99, and max latencies from a collection of numerical samples.

    Parameters:
        samples: Array of latency floats or ints in milliseconds.

    Returns:
        Dictionary containing:
            - "p50": 50th percentile (median) in ms
            - "p95": 95th percentile in ms
            - "p99": 99th percentile in ms
            - "max": Maximum observed latency in ms
            - "sample_count": Total number of samples evaluated
            - "is_exact": True if N <= 1000 (all samples evaluated), False if sampled
    """
    if not samples:
        return {
            "p50": 0.0,
            "p95": 0.0,
            "p99": 0.0,
            "max": 0.0,
            "sample_count": 0,
            "is_exact": True,
        }

    # Convert to floats and sort in ascending order:
    sorted_samples = sorted(float(x) for x in samples)
    n = len(sorted_samples)

    def _get_percentile(p: float) -> float:
        # Nearest-rank formulation: ceil(p * N) - 1
        rank = math.ceil((p / 100.0) * n) - 1
        idx = max(0, min(n - 1, rank))
        return round(sorted_samples[idx], 2)

    return {
        "p50": _get_percentile(50.0),
        "p95": _get_percentile(95.0),
        "p99": _get_percentile(99.0),
        "max": round(sorted_samples[-1], 2),
        "sample_count": n,
        "is_exact": n <= 1000,
    }
