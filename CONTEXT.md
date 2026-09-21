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

**Commission Attribution Date**:
The challan date of the wholesale order for adjustment-generated commission, or the explicitly selected date for a manual commission that has no order.
_Avoid_: Adjustment date, settlement completion date, expense entry date

**Commission Owner**:
The SR explicitly selected for a commission expense, or DB Point when an order expense has no selected SR. A DSR may deliver the related order but does not own its commission.
_Avoid_: Delivery person, expense creator
