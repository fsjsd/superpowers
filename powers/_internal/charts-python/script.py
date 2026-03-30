import sys
import json
import random

descriptor = {
    "name": "Demo - Charts (Python)",
    "description": "Returns randomised dummy data for all supported chart types.",
    "color": "#3b82f6",
    "category": "Testing",
    "requirements": [],
    "icon": "chart-bar",
    "input_schema": [
        {
            "name": "data-points",
            "type": "number",
            "label": "Data Points",
            "description": "Number of data points to generate per chart",
            "required": False,
            "default": "10",
        }
    ],
    "output_schema": [
        {"type": "chart", "chartType": "bar", "label": "Bar Chart"},
        {"type": "chart", "chartType": "line", "label": "Line Chart"},
        {"type": "chart", "chartType": "area", "label": "Area Chart"},
        {"type": "chart", "chartType": "pie", "label": "Pie Chart"},
    ],
}

if "--superpowers" in sys.argv:
    idx = sys.argv.index("--superpowers")
    if idx + 1 < len(sys.argv) and sys.argv[idx + 1] == "describe":
        print(json.dumps(descriptor))
        sys.exit(0)


def parse_args(argv):
    result = {}
    for arg in argv:
        if arg.startswith("--"):
            parts = arg[2:].split("=", 1)
            if len(parts) == 2:
                result[parts[0]] = parts[1]
    return result


def rand(min_val, max_val):
    return round(random.uniform(min_val, max_val), 2)


params = parse_args(sys.argv[1:])
count = max(1, int(params.get("data-points", "10")))

MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
CATEGORIES = [
    "Electronics", "Clothing", "Food", "Books", "Sports",
    "Toys", "Beauty", "Automotive", "Garden", "Music",
]

# Bar chart
bar_data = []
for i in range(count):
    label = MONTHS[i % len(MONTHS)]
    if i >= len(MONTHS):
        label += f" Y{i // len(MONTHS) + 1}"
    bar_data.append({"month": label, "revenue": rand(1000, 9000), "expenses": rand(500, 6000)})

print(json.dumps([{
    "event": "output",
    "payload": {
        "type": "chart",
        "chartType": "bar",
        "title": "Revenue vs Expenses (Bar)",
        "nameKey": "month",
        "dataKeys": ["revenue", "expenses"],
        "data": bar_data,
    },
}]))

# Line chart
line_data = [
    {"day": f"Day {i + 1}", "temperature": rand(-5, 35), "humidity": rand(20, 95)}
    for i in range(count)
]

print(json.dumps([{
    "event": "output",
    "payload": {
        "type": "chart",
        "chartType": "line",
        "title": "Temperature & Humidity (Line)",
        "nameKey": "day",
        "dataKeys": ["temperature", "humidity"],
        "data": line_data,
    },
}]))

# Area chart
area_data = [
    {"week": f"Wk {i + 1}", "downloads": rand(200, 5000), "uploads": rand(50, 2000)}
    for i in range(count)
]

print(json.dumps([{
    "event": "output",
    "payload": {
        "type": "chart",
        "chartType": "area",
        "title": "Downloads & Uploads (Area)",
        "nameKey": "week",
        "dataKeys": ["downloads", "uploads"],
        "data": area_data,
    },
}]))

# Pie chart
pie_data = []
for i in range(count):
    label = CATEGORIES[i % len(CATEGORIES)]
    if i >= len(CATEGORIES):
        label += f" {i // len(CATEGORIES) + 1}"
    pie_data.append({"category": label, "value": rand(50, 500)})

print(json.dumps([{
    "event": "output",
    "payload": {
        "type": "chart",
        "chartType": "pie",
        "title": "Sales by Category (Pie)",
        "nameKey": "category",
        "dataKeys": ["value"],
        "data": pie_data,
    },
}]))
