"""
===================================================================================
SignalBridge Webhook Ingestion Engine — Priority Queue Min-Heap Retry Scheduler
===================================================================================
PURPOSE:
    This module implements DSA Module 3: a Priority Queue using a Binary Min-Heap
    ('heapq') to schedule delayed webhook retries with exponential backoff.

ALGORITHMIC PROBLEM & SOLUTION:
    - Problem: Webhooks failing due to transient upstream 5xx errors or network blips
      must be retried at specific future timestamps (e.g., now + 5s, now + 25s, now + 125s).
      A naive array requires O(N) linear scans to discover ready tasks, while sorting
      on every insertion costs O(N log N).
    - Solution: A Binary Min-Heap maintains the minimum 'retry_timestamp' at the root
      (index 0) in O(1) peek time.
      - heappush: Inserts a new retry item in O(log N) time via upward sift.
      - heappop: Extracts the earliest ready task in O(log N) time via downward sift.
      - Thread Safety: Guarded with 'threading.Lock()' for safe concurrent worker execution.
===================================================================================
"""
import heapq
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass(order=True)
class DelayedRetryTask:
    """
    Represents an enqueued delayed retry task in the Min-Heap.

    The dataclass is ordered by 'retry_timestamp' so the element with the lowest
    timestamp (earliest execution time) naturally sorts to the root of the heap.
    Attributes with 'compare=False' are excluded from comparison logic.
    """
    # Priority key for min-heap comparison (earliest timestamp wins):
    retry_timestamp: float

    # Task identifier (string UUID or tracking ID):
    task_id: str = field(compare=False)

    # Number of retry attempts previously executed:
    attempt: int = field(compare=False, default=1)

    # Associated webhook payload or argument dictionary:
    payload: Dict[str, Any] = field(compare=False, default_factory=dict)

    # Optional error reason that triggered the retry:
    last_error: str = field(compare=False, default="")


class MinHeapRetryScheduler:
    """
    Thread-safe Priority Queue Min-Heap scheduler for delayed retry execution.
    """

    def __init__(self):
        # The internal list backing the binary min-heap:
        self._heap: List[DelayedRetryTask] = []
        # Mutex lock guaranteeing thread safety across concurrent workers:
        self._lock = threading.Lock()

    def schedule_retry(
        self,
        task_id: str,
        delay_seconds: float,
        payload: Optional[Dict[str, Any]] = None,
        attempt: int = 1,
        last_error: str = "",
    ) -> DelayedRetryTask:
        """
        Schedules a task for future retry in O(log N) time.

        Args:
            task_id: Unique task tracking identifier.
            delay_seconds: Number of seconds from now to execute the retry.
            payload: Webhook payload dictionary.
            attempt: Current retry attempt count.
            last_error: Diagnostic description of previous failure.

        Returns:
            DelayedRetryTask: The enqueued task instance.
        """
        execute_at = time.time() + max(0.0, float(delay_seconds))
        task = DelayedRetryTask(
            retry_timestamp=execute_at,
            task_id=task_id,
            attempt=attempt,
            payload=payload or {},
            last_error=last_error,
        )

        with self._lock:
            heapq.heappush(self._heap, task)
            logger.debug(
                f"[MinHeapScheduler] Scheduled retry for task '{task_id}' (attempt {attempt}) "
                f"in {delay_seconds:.2f}s (Heap size: {len(self._heap)})"
            )

        return task

    def peek_next_timestamp(self) -> Optional[float]:
        """
        Returns the earliest retry timestamp without removing it from the heap in O(1) time.
        """
        with self._lock:
            if not self._heap:
                return None
            return self._heap[0].retry_timestamp

    def time_until_next_task(self) -> Optional[float]:
        """
        Returns seconds remaining until the earliest task is ready (0.0 if already overdue).
        """
        next_ts = self.peek_next_timestamp()
        if next_ts is None:
            return None
        return max(0.0, next_ts - time.time())

    def pop_ready_tasks(self, current_time: Optional[float] = None) -> List[DelayedRetryTask]:
        """
        Pops and returns all tasks whose retry_timestamp <= current_time in chronological order.

        Args:
            current_time: Reference timestamp in seconds (defaults to time.time()).

        Returns:
            List[DelayedRetryTask]: Extracted ready tasks sorted from oldest to newest.
        """
        now = time.time() if current_time is None else current_time
        ready_tasks: List[DelayedRetryTask] = []

        with self._lock:
            # O(1) inspect root, O(log N) pop if ready:
            while self._heap and self._heap[0].retry_timestamp <= now:
                task = heapq.heappop(self._heap)
                ready_tasks.append(task)

        if ready_tasks:
            logger.info(
                f"[MinHeapScheduler] Extracted {len(ready_tasks)} ready retry tasks "
                f"(Remaining heap size: {len(self._heap)})"
            )

        return ready_tasks

    def cancel_task(self, task_id: str) -> bool:
        """
        Cancels and removes a scheduled task by task_id in O(N) time + O(N) heapify.
        """
        with self._lock:
            original_len = len(self._heap)
            self._heap = [task for task in self._heap if task.task_id != task_id]
            if len(self._heap) != original_len:
                heapq.heapify(self._heap)
                logger.info(f"[MinHeapScheduler] Cancelled task '{task_id}'.")
                return True
            return False

    def __len__(self) -> int:
        """Returns the current number of tasks scheduled in the heap."""
        with self._lock:
            return len(self._heap)

    def clear(self) -> None:
        """Clears all tasks from the heap."""
        with self._lock:
            self._heap.clear()


# Global singleton instance for application-wide delayed retries:
min_heap_scheduler = MinHeapRetryScheduler()
