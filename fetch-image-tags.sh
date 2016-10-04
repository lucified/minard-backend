#!/bin/bash

set -e

BUCKET="lucify-configuration"
charles_staging=`aws s3 cp s3://$BUCKET/ecs_services/charles_staging_tag -`
echo "charles staging -> $charles_staging"
charles_production=`aws s3 cp s3://$BUCKET/ecs_services/charles_production_tag -`
echo "charles production -> $charles_production"
gitlab_staging=`aws s3 cp s3://$BUCKET/ecs_services/gitlab_staging_tag -`
echo "gitlab staging -> $gitlab_staging"
gitlab_production=`aws s3 cp s3://$BUCKET/ecs_services/gitlab_production_tag -`
echo "gitlab production -> $gitlab_production"
screenshotter_staging=`aws s3 cp s3://$BUCKET/ecs_services/screenshotter_staging_tag -`
echo "screenshotter staging -> $screenshotter_staging"
screenshotter_production=`aws s3 cp s3://$BUCKET/ecs_services/screenshotter_production_tag -`
echo "screenshotter production -> $screenshotter_production"
runner_staging=`aws s3 cp s3://$BUCKET/ecs_services/runner_staging_tag -`
echo "runner staging -> $runner_staging"
runner_production=`aws s3 cp s3://$BUCKET/ecs_services/runner_production_tag -`
echo "runner production -> $runner_production"

