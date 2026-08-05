# Stacked pull request order

This branch starts from `refactor/react-storage-quality`.

Recommended merge order:

1. Merge the React/storage quality refactor into `main`.
2. Retarget the search-first pull request to `main`, or merge it into the refactor branch before the refactor reaches `main`.
3. Apply the separate visual-refresh branch only after resolving its `src/main.tsx` and CSS import overlap.
