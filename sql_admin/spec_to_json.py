import pandas as pd
import json

# Read Excel file
df = pd.read_excel('export_spec.xlsx')

# Convert to JSON
json_data = df.to_json(orient='records', indent=2)

# Save to file
with open('output.json', 'w') as f:
    f.write(json_data)

print("JSON exported successfully!")