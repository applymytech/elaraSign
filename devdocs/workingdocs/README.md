# Working Docs

This folder is for **engineers actively developing features**.

## Purpose

When working on new code:
1. Create test scripts here as you work
2. Experiment without polluting the main test suite
3. Once code is accepted, promote tests to main `src/testing/`

## Structure

```
workingdocs/
├── feature-name/
│   ├── notes.md           # Your working notes
│   ├── test-script.ts     # Your experimental tests
│   └── scratch.ts         # Throwaway experiments
└── another-feature/
    └── ...
```

## Rules

1. **This folder is gitignored** - Your experiments stay local
2. **No production code here** - Only tests and notes
3. **Clean up when done** - Delete or promote to main tests
4. **Document your intent** - Future you will thank present you

## Promoting to Main Tests

When your feature is complete:

1. Move working tests to `src/testing/`
2. Ensure they follow the project test patterns
3. Run full test suite to verify integration
4. Delete the working folder

## AI Copilot Note

If you're an AI helping with development:
- Use this folder for experimental test code
- Document what you're trying to accomplish
- Be honest about what's complete vs stub code
- The deploy checklist will ask about completeness
