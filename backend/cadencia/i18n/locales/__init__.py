"""Message catalogues: ``<locale package>/<namespace>.py``, each exporting ``MESSAGES``.

en_US is the source of truth for the key set. A namespace module may also export ``SAMPLES``
(``{local key: {param: value}}``, en_US only) when the catalogue tests cannot guess parameters
that render every locale's entry.
"""
