# Garage holding period v1

For UTVECKLA / IN vehicles, `holding_period_months` is a vehicle-level planning value.

Allowed values: 4, 6, 9, 12, 18, 24 months.

The value is stored separately from `daily_rate` and `planned_delivery_date`.

The IN table presents Hålltid directly after Dygnsdeb. Planned delivery is no longer shown in the IN view. Existing delivery data is not deleted and remains available to other flows, including AVVECKLA / UT.
