from __future__ import annotations

import pytest

from cadencia.analytics.data import invalidate
from cadencia.demo import DemoJira
from cadencia.store.db import create_all, make_engine, make_session_factory
from tests.support import NOW, make_settings, process_locale


@pytest.fixture(autouse=True)
def _locale(request):
    """pt-BR unless the test says ``@pytest.mark.locale("de-DE")``; a module may override this
    fixture (test_golden runs under en-US and de-DE)."""
    marker = request.node.get_closest_marker("locale")
    locale = marker.args[0] if marker else "pt-BR"
    with process_locale(locale):
        yield locale


@pytest.fixture
def settings(tmp_path):
    return make_settings(tmp_path)


@pytest.fixture
def sessions():
    invalidate()
    engine = make_engine("sqlite:///:memory:")
    create_all(engine)
    yield make_session_factory(engine)
    engine.dispose()
    invalidate()


@pytest.fixture
def demo():
    return DemoJira(NOW)
