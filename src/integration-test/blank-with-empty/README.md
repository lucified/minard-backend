# BLANKO

Used for testing Minard builds.

Create new project in GitLab named *blank*.

Add the GitLab remote with:
```
git remote add gitlab ssh://git@localhost:10022/root/blank.git
```

Trigger a build:
```
echo "\n" >> ./README.md && \
git add -A && \
git commit -am "Improve README" && \
git push gitlab master
```





























































