from datetime import UTC, datetime

from cadencia.demo import FIELDS, DemoJira
from cadencia.domain.models import ChangeField
from cadencia.jira.fields import FieldMap, discover_fields
from cadencia.jira.mapping import issue_from_payload, parse_datetime, transitions_from_changelog
from tests.support import NOW


def test_custom_fields_are_discovered_by_schema_not_hardcoded_ids():
    fm = discover_fields(FIELDS)
    assert fm.sprint == "customfield_10020"
    assert fm.epic_link == "customfield_10014"
    assert fm.rank == "customfield_10019"
    assert fm.flagged == "customfield_10021"
    assert fm.story_points == ("customfield_10016", "customfield_10050")
    assert fm.missing() == []


def test_manual_overrides_win_and_empty_values_keep_discovery():
    fm = discover_fields(FIELDS).merged({"story_points": ["customfield_99"], "sprint": ""})
    assert fm.story_points == ("customfield_99",)
    assert fm.sprint == "customfield_10020"


def test_issue_payload_translation():
    demo = DemoJira(NOW)
    fm = discover_fields(FIELDS)
    carried = issue_from_payload(demo.issues["CAD-11"].payload(), fm)
    assert carried.parent_key == "CAD-1"
    assert carried.estimate == 8.0
    assert carried.sprint_ids == (11, 12)
    assert carried.assignee.display_name == "Carla Mendes"
    assert carried.hierarchy_level == 0
    assert issue_from_payload(demo.issues["CAD-13"].payload(), fm).flagged
    assert issue_from_payload(demo.issues["CAD-18"].payload(), fm).blocked_by == ("CAD-11",)
    assert issue_from_payload(demo.issues["CAD-19"].payload(), fm).is_subtask


def test_epic_link_fallback_and_legacy_sprint_strings():
    fm = FieldMap(epic_link="customfield_10014", sprint="customfield_10020")
    raw = {
        "key": "OLD-1",
        "fields": {
            "summary": "Legado",
            "issuetype": {"name": "História"},
            "status": {"id": "1", "name": "Aberto", "statusCategory": {"key": "new"}},
            "created": "2026-09-08T10:15:30.123-0300",
            "customfield_10014": "OLD-EPIC",
            "customfield_10020": [
                "com.atlassian.greenhopper.service.sprint.Sprint@1a[id=12,rapidViewId=1,state=ACTIVE]"
            ],
        },
    }
    item = issue_from_payload(raw, fm)
    assert item.parent_key == "OLD-EPIC"
    assert item.sprint_ids == (12,)
    assert item.created == datetime(2026, 9, 8, 13, 15, 30, 123000, tzinfo=UTC)
    assert parse_datetime("2026-09-08T13:15:30Z") == datetime(2026, 9, 8, 13, 15, 30, tzinfo=UTC)


def test_changelog_translation_keeps_only_relevant_fields():
    demo = DemoJira(NOW)
    histories = [
        *demo.issues["CAD-11"].histories,
        {
            "id": "1",
            "created": "2026-09-01T10:00:00.000+0000",
            "items": [{"field": "labels", "fieldId": "labels"}],
        },
    ]
    transitions = transitions_from_changelog("CAD-11", histories, discover_fields(FIELDS))
    assert {t.field for t in transitions} == {ChangeField.STATUS, ChangeField.SPRINT, ChangeField.ASSIGNEE}
    sprint_moves = [t for t in transitions if t.field is ChangeField.SPRINT]
    assert sprint_moves[-1].to_id == "11, 12"
