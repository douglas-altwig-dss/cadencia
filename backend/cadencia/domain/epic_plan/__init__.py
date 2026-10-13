"""Epic plan: roles, capacity, hours per role, dependencies and weekly schedules of one epic.

The **subtask** is the atomic unit — of estimate, of allocation and of dependency. A task is only
ever the sum of its subtasks. Pure like the rest of ``domain``: the Jira adapter lives in
``analytics.epic_plan`` and hands this package an :class:`~.model.Epic`.

- ``model``: the entities and the parameters.
- ``hours``: every number of the plan's section 5 (hours, person-hours, capacity), once.
- ``graph``: derived task dependencies, cycles, critical path, diagram layers.
- ``schedule``: the time model, the plan validator, list scheduling and the baseline.
- ``timeline``: days, weeks and the pieces the views draw, read off a schedule.
- ``solvers``: MILP (HiGHS through OR-Tools MathOpt) and CP-SAT.
- ``strategies``: the registry the algorithm picker reads.
"""
