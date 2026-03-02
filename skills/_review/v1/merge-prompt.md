Update the analysis for music skill "{{SKILL_ID}}" with NEW data.

{{EXISTING_INSIGHTS}}

NEW DATA (since last review):
{{DATA_SECTIONS}}

MERGE INSTRUCTIONS:
- Keep existing insights that are still supported by the data
- Update move groups if new data changes their effectiveness (avg_improvement, works_when)
- If new data contradicts an existing insight, replace it with the updated version
- Add newly discovered move groups or recipes not covered by existing analysis
- Remove insights that new data shows were wrong (e.g. a move that seemed good but now has negative trend)
- The top_insight should reflect the CURRENT best understanding, not just the new data

{{RESPONSE_SCHEMA}}
