"""TeaStore preset - the benchmark app Phases 5-7 actually used.

Values mirror the defaults the live controllers already ship with
(project/live_cluster/module1_controller/app.py's PROBE_URL /
TARGET_DEPLOYMENT / TARGET_LABEL_SELECTOR and actuator/app.py's
TARGET_DEPLOYMENT), so selecting this preset restores exactly the
configuration the validated results were produced under.
"""

TEASTORE = {
    "key": "teastore",
    "name": "TeaStore (webui)",
    "description": "The Descartes Research microservice benchmark used for this project's Phase 5-7 live work.",
    "namespace": "default",
    "deployment": "teastore-webui",
    "label_selector": "run=teastore-webui",
    "service": "teastore-webui",
    "service_port": 8080,
    "probe_path": "/tools.descartes.teastore.webui/",
    # What Module 1 / the actuator use from inside the cluster (Service DNS).
    "probe_url_in_cluster": "http://teastore-webui:8080/tools.descartes.teastore.webui/",
}

PRESETS = {TEASTORE["key"]: TEASTORE}
