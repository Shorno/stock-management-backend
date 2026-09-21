# Stock Distribution

This context tracks wholesale sales, field representatives, settlement expenses, and commissions for a distribution business.

## Language

**DB Point**:
The distributor's own virtual sales identity for order items and expenses that are not assigned to an SR. It is stored with no SR and exposed as identity `0` in reports.
_Avoid_: DV Point, unassigned SR

**SR**:
A sales representative who may own order items and receive explicitly assigned commission expenses.
_Avoid_: DB Point

**DSR**:
The delivery sales representative assigned to a wholesale order.
_Avoid_: SR
