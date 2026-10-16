"""
===================================================================================
SignalBridge — Priority Queue Min-Heap Retry Scheduler Unit Tests
===================================================================================
"""
import time
from django.test import SimpleTestCase

from apps.core.dsa.min_heap import DelayedRetryTask, MinHeapRetryScheduler


class MinHeapSchedulerTestCase(SimpleTestCase):
    """Unit tests validating priority queue Min-Heap invariants and extraction ordering."""

    def setUp(self):
        self.scheduler = MinHeapRetryScheduler()

    def test_chronological_ordering_regardless_of_insertion_order(self):
        """
        Validates that tasks inserted in random order are extracted in strict
        chronological priority order (earliest timestamp first).
        """
        base_time = 1000.0

        # Schedule tasks with deliberate out-of-order delays:
        self.scheduler._heap.append(DelayedRetryTask(retry_timestamp=base_time + 30, task_id="task-30"))
        self.scheduler._heap.append(DelayedRetryTask(retry_timestamp=base_time + 5, task_id="task-05"))
        self.scheduler._heap.append(DelayedRetryTask(retry_timestamp=base_time + 60, task_id="task-60"))
        self.scheduler._heap.append(DelayedRetryTask(retry_timestamp=base_time + 10, task_id="task-10"))
        self.scheduler._heap.append(DelayedRetryTask(retry_timestamp=base_time + 1, task_id="task-01"))

        # Heapify the list into a valid min-heap:
        import heapq
        heapq.heapify(self.scheduler._heap)

        # Pop tasks when current_time = base_time + 15:
        # Should pop: task-01, task-05, task-10 in exact chronological order:
        ready = self.scheduler.pop_ready_tasks(current_time=base_time + 15)
        self.assertEqual(len(ready), 3)
        self.assertEqual(ready[0].task_id, "task-01")
        self.assertEqual(ready[1].task_id, "task-05")
        self.assertEqual(ready[2].task_id, "task-10")

        # Remaining in heap: task-30 and task-60:
        self.assertEqual(len(self.scheduler), 2)
        self.assertEqual(self.scheduler.peek_next_timestamp(), base_time + 30)

        # Pop all remaining tasks at current_time = base_time + 100:
        remaining = self.scheduler.pop_ready_tasks(current_time=base_time + 100)
        self.assertEqual(len(remaining), 2)
        self.assertEqual(remaining[0].task_id, "task-30")
        self.assertEqual(remaining[1].task_id, "task-60")
        self.assertEqual(len(self.scheduler), 0)

    def test_schedule_retry_api(self):
        """Validates schedule_retry convenience API and delay calculation."""
        task = self.scheduler.schedule_retry(
            task_id="webhook-retry-1",
            delay_seconds=10.0,
            payload={"source": "datadog"},
            attempt=2,
            last_error="Connection timed out",
        )
        self.assertEqual(task.task_id, "webhook-retry-1")
        self.assertEqual(task.attempt, 2)
        self.assertEqual(task.last_error, "Connection timed out")
        self.assertEqual(len(self.scheduler), 1)
        self.assertAlmostEqual(task.retry_timestamp, time.time() + 10.0, delta=1.0)

    def test_cancel_task(self):
        """Validates task cancellation and heap invariant restoration."""
        self.scheduler.schedule_retry("task-a", 10.0)
        self.scheduler.schedule_retry("task-b", 5.0)
        self.scheduler.schedule_retry("task-c", 15.0)

        # Cancel task-b (which was root):
        cancelled = self.scheduler.cancel_task("task-b")
        self.assertTrue(cancelled)
        self.assertEqual(len(self.scheduler), 2)

        # Next root should now be task-a (10.0s delay):
        next_ready = self.scheduler.pop_ready_tasks(current_time=time.time() + 12.0)
        self.assertEqual(len(next_ready), 1)
        self.assertEqual(next_ready[0].task_id, "task-a")

    def test_empty_heap_pop_returns_empty_list(self):
        """Validates that popping from an empty scheduler does not raise an exception."""
        ready = self.scheduler.pop_ready_tasks()
        self.assertEqual(ready, [])
        self.assertIsNone(self.scheduler.peek_next_timestamp())
        self.assertIsNone(self.scheduler.time_until_next_task())
