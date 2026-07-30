"""Shared paths and fixed local ports for the desktop app.

Local port choices avoid the 4 live-controller ports the port-forward
manager will bind to on this same machine (18000/18090/18091/18092, mirrored
from project/live_cluster/ablation/run_trial.py's MODULE1_PF_PORT/MODULE3_PF_PORT
convention) - see Milestone 4.
"""
from pathlib import Path

DESKTOP_APP_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = DESKTOP_APP_DIR.parent
IMPLEMENTATION_DIR = PROJECT_DIR.parent

RESULTS_DIR = PROJECT_DIR / "results"
LIVE_CLUSTER_DIR = PROJECT_DIR / "live_cluster"
FRONTEND_DIR = DESKTOP_APP_DIR / "frontend"

APP_SERVER_HOST = "127.0.0.1"
# Not 8501 (Streamlit's default) or 8765 (seen bound by a leftover Streamlit
# process on this machine during development) - deliberately outside both.
APP_SERVER_PORT = 8877

CLUSTER_NAME = "fyp-autoscaling"
CONTROL_PLANE_CONTAINER = f"{CLUSTER_NAME}-control-plane"

# Local ports for persistent kubectl port-forwards onto the live controllers
# (Milestone 4) - fixed so the frontend never has to discover them. The
# "target" entry is the one that changes: it follows whichever application is
# currently plugged in (orchestrator/target_app.py), and the load generator
# (Milestone 5) drives traffic through it.
PORT_FORWARDS = {
    "module1": {"service": "service/module1-controller", "local_port": 18000, "remote_port": 8000},
    "module2": {"service": "service/module2-extender", "local_port": 18090, "remote_port": 8090},
    "module3": {"service": "service/module3-controller", "local_port": 18091, "remote_port": 8091},
    "actuator": {"service": "service/actuator", "local_port": 18092, "remote_port": 8092},
    "target": {"service": "service/teastore-webui", "local_port": 18080, "remote_port": 8080},
}

# Only these expose a /healthz the port-forward watchdog can probe; the target
# application is an arbitrary third-party app with no such contract.
HEALTHZ_FORWARDS = {"module1", "module2", "module3", "actuator"}

# The framework's own Deployments, in the order the Home page reports them.
# The actuator is listed last and treated as optional on purpose: it only runs
# during the ablation arms that use it (m1_only / m3_only / full), so 0
# replicas there is a normal resting state, not an incomplete deployment.
COMPONENT_DEPLOYMENTS = ["module1-controller", "module2-extender", "module3-controller", "actuator"]
