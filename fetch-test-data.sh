#!/bin/bash

set -e

DIRECTORY="gitlab-data"
OLD_DIRECTORY="gitlab-data-backup"
FILENAME="test-data.tar.gz"
aws s3 cp s3://lucify-configuration/minard/$FILENAME .
if [ -d $DIRECTORY ]; then
  echo "Backing up existing $DIRECTORY to $OLD_DIRECTORY"
  mv $DIRECTORY $OLD_DIRECTORY
fi
tar -xvzf $FILENAME
rm $FILENAME

echo "test-data downloaded and extracted succesfully!"
