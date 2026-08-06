"""Build the four framework images and push them to ECR (Phase 10, step C).

    python ecr_push.py                 # build + push all four
    python ecr_push.py --dry-run       # print what it would do, touch nothing
    python ecr_push.py --only module1-controller
    python ecr_push.py --write-manifests    # also rewrite the deployment.yaml image refs

Needs the AWS CLI configured (`aws configure`) and Docker running. Uses the CLI
rather than boto3 so there is no extra Python dependency, and because
`aws ecr get-login-password` is the documented way to authenticate Docker.

Idempotent: repositories are created only if absent, and pushing an unchanged
image is a no-op on the registry side.

On kind the equivalent step was `docker build` + `kind load docker-image`,
which needs no registry at all. EKS nodes cannot see the local Docker daemon,
so the images have to live somewhere the nodes can pull from - hence ECR.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

LIVE_CLUSTER_DIR = Path(__file__).resolve().parent.parent / "live_cluster"

# image name -> build context directory (relative to LIVE_CLUSTER_DIR), matching
# what desktop_app/backend/orchestrator/cluster_setup.py does for kind.
COMPONENTS = {
    "module1-controller": "module1_controller",
    "module2-extender": "module2_extender",
    "module3-controller": "module3_controller",
    "actuator": "actuator",
}


def run(cmd: list[str], capture: bool = True, check: bool = True, **kw) -> subprocess.CompletedProcess:
    print(f"$ {' '.join(cmd)}", flush=True)
    return subprocess.run(
        cmd, capture_output=capture, text=True, encoding="utf-8", errors="replace",
        check=check, **kw,
    )


def aws_identity() -> tuple[str, str]:
    """(account_id, region) from the configured CLI profile."""
    try:
        ident = json.loads(run(["aws", "sts", "get-caller-identity"]).stdout)
    except FileNotFoundError:
        sys.exit("aws CLI not found on PATH. Install it, then run `aws configure`.")
    except subprocess.CalledProcessError as exc:
        sys.exit(f"aws sts get-caller-identity failed - is the CLI configured?\n{exc.stderr}")

    region = run(["aws", "configure", "get", "region"], check=False).stdout.strip()
    if not region:
        sys.exit("No default region configured. Run `aws configure` or set AWS_DEFAULT_REGION.")
    return ident["Account"], region


def ensure_repository(name: str, region: str, dry_run: bool) -> None:
    exists = run(
        ["aws", "ecr", "describe-repositories", "--repository-names", name, "--region", region],
        check=False,
    ).returncode == 0
    if exists:
        print(f"  repository {name} already exists")
        return
    if dry_run:
        print(f"  [dry-run] would create repository {name}")
        return
    run([
        "aws", "ecr", "create-repository",
        "--repository-name", name,
        "--region", region,
        # Scan on push is free and catches base-image CVEs; immutable tags are
        # deliberately NOT set, because we re-push :latest as the code changes.
        "--image-scanning-configuration", "scanOnPush=true",
    ])
    print(f"  created repository {name}")


def docker_login(account: str, region: str, dry_run: bool) -> None:
    registry = f"{account}.dkr.ecr.{region}.amazonaws.com"
    if dry_run:
        print(f"[dry-run] would docker login to {registry}")
        return
    print(f"$ aws ecr get-login-password | docker login {registry}")
    password = run(["aws", "ecr", "get-login-password", "--region", region]).stdout.strip()
    proc = subprocess.run(
        ["docker", "login", "--username", "AWS", "--password-stdin", registry],
        input=password, text=True, encoding="utf-8", errors="replace",
        capture_output=True,
    )
    if proc.returncode != 0:
        sys.exit(f"docker login failed:\n{proc.stdout}\n{proc.stderr}")
    print("  logged in")


def build_and_push(image: str, context: str, registry: str, tag: str, dry_run: bool) -> str:
    uri = f"{registry}/{image}:{tag}"
    if dry_run:
        print(f"[dry-run] would build {context} -> {uri}")
        return uri
    # streamed, not captured: image builds are slow and silence looks like a hang
    run(["docker", "build", "-t", f"{image}:{tag}", context],
        capture=False, cwd=str(LIVE_CLUSTER_DIR))
    run(["docker", "tag", f"{image}:{tag}", uri], capture=False)
    run(["docker", "push", uri], capture=False)
    return uri


def write_manifest_image(image: str, uri: str, dry_run: bool) -> None:
    """Point a component's deployment.yaml at its ECR URI.

    Also forces imagePullPolicy: Always. On kind the manifests use
    IfNotPresent, which is correct there (the image is side-loaded and never
    pullable); on EKS that same setting would pin nodes to whatever they
    happened to cache and quietly ignore a re-push.
    """
    path = LIVE_CLUSTER_DIR / COMPONENTS[image] / "deployment.yaml"
    text = path.read_text(encoding="utf-8")
    new = re.sub(r"^(\s*image:\s*).*$", rf"\g<1>{uri}", text, count=1, flags=re.M)
    new = re.sub(r"^(\s*imagePullPolicy:\s*).*$", r"\g<1>Always", new, count=1, flags=re.M)
    if new == text:
        print(f"  {path.name}: no change")
        return
    if dry_run:
        print(f"  [dry-run] would rewrite {path}")
        return
    path.write_text(new, encoding="utf-8")
    print(f"  rewrote {path}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build and push the framework images to ECR")
    parser.add_argument("--tag", default="latest")
    parser.add_argument("--only", action="append", choices=sorted(COMPONENTS),
                        help="repeatable; default is all four")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--write-manifests", action="store_true",
                        help="rewrite each deployment.yaml's image + imagePullPolicy "
                             "(MODIFIES files under live_cluster/ - review the diff before committing)")
    args = parser.parse_args()

    images = args.only or list(COMPONENTS)
    account, region = aws_identity()
    registry = f"{account}.dkr.ecr.{region}.amazonaws.com"
    print(f"\naccount {account}  region {region}\nregistry {registry}\n")

    for image in images:
        print(f"--- {image} ---")
        ensure_repository(image, region, args.dry_run)

    docker_login(account, region, args.dry_run)

    uris = {}
    for image in images:
        print(f"--- {image} ---")
        uris[image] = build_and_push(image, COMPONENTS[image], registry, args.tag, args.dry_run)

    if args.write_manifests:
        print("\n--- manifests ---")
        for image, uri in uris.items():
            write_manifest_image(image, uri, args.dry_run)

    print("\nImage URIs:")
    for image, uri in uris.items():
        print(f"  {image:22s} {uri}")
    if not args.write_manifests:
        print("\nRe-run with --write-manifests to point the deployment.yaml files at these,\n"
              "or set them by hand.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
