#!/usr/bin/env bash
set -euo pipefail

awslocal s3 mb s3://exports-local --region us-east-1 || echo "Bucket already exists, skipping."
echo "S3 bucket exports-local ready."
