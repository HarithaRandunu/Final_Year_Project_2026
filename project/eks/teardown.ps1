# Deletes the Phase 10 EKS cluster and VERIFIES it is gone.
#
#   .\teardown.ps1
#
# The verification is the point. The EKS control plane bills ~$0.10/hour
# whether or not anything runs on it, so a delete that silently failed - a
# stuck CloudFormation stack, an expired credential, a typo'd region - costs
# about $2.40 a day, indefinitely. `eksctl delete cluster` alone does not tell
# you loudly enough.
#
# Run this at the end of EVERY session, not just the last one.

param(
    [string]$ClusterName = "fyp-autoscaling",
    [string]$Region = "",
    [switch]$KeepEcr    # ECR repos are cheap and re-pushing is slow; kept by default
)

$ErrorActionPreference = "Stop"

if (-not $Region) {
    $Region = (aws configure get region).Trim()
    if (-not $Region) { throw "No region given and none configured. Pass -Region." }
}

Write-Output "Deleting cluster '$ClusterName' in $Region ..."
Write-Output "(this takes 10-15 minutes; leave it running)"

# --wait so the script does not report success while CloudFormation is still
# tearing down - the exact case where a stack gets stuck and keeps billing.
eksctl delete cluster --name $ClusterName --region $Region --wait

Write-Output ""
Write-Output "Verifying ..."
$remaining = eksctl get cluster --region $Region 2>&1 | Out-String

if ($remaining -match $ClusterName) {
    Write-Output ""
    Write-Warning "'$ClusterName' IS STILL LISTED. It is still billing."
    Write-Output "Check the CloudFormation console for a stuck stack:"
    Write-Output "  aws cloudformation describe-stacks --region $Region --query `"Stacks[?contains(StackName,'$ClusterName')].[StackName,StackStatus]`" --output table"
    exit 1
}

Write-Output "Cluster '$ClusterName' is gone."

# Anything left that still costs money, listed rather than silently assumed
# absent. Orphaned EBS volumes and load balancers are the usual survivors of a
# partial delete.
Write-Output ""
Write-Output "Leftovers worth checking:"
$vols = aws ec2 describe-volumes --region $Region --filters "Name=status,Values=available" --query "Volumes[].[VolumeId,Size]" --output text 2>$null
if ($vols) { Write-Warning "Unattached EBS volumes (billing):`n$vols" } else { Write-Output "  no unattached EBS volumes" }

$lbs = aws elbv2 describe-load-balancers --region $Region --query "LoadBalancers[].LoadBalancerName" --output text 2>$null
if ($lbs) { Write-Warning "Load balancers still present (billing):`n$lbs" } else { Write-Output "  no load balancers" }

if (-not $KeepEcr) {
    Write-Output ""
    Write-Output "Deleting ECR repositories ..."
    foreach ($repo in @("module1-controller", "module2-extender", "module3-controller", "actuator")) {
        aws ecr delete-repository --repository-name $repo --region $Region --force 2>$null | Out-Null
        Write-Output "  deleted $repo"
    }
} else {
    Write-Output ""
    Write-Output "ECR repositories kept (a few cents/month; saves re-pushing next session)."
    Write-Output "Pass -KeepEcr:`$false to delete them."
}

Write-Output ""
Write-Output "Done. Billing for this cluster has stopped."
