# Custom Code Review Rules

This file contains project-specific code review rules that will be automatically included in the review merge analysis.

## Example Rules

### Security
- Always validate user input before processing
- Never commit API keys, passwords, or sensitive credentials
- Use parameterized queries to prevent SQL injection

### Code Quality
- Functions should not exceed 50 lines of code
- Use meaningful variable and function names
- Add JSDoc comments for all public functions

### Testing
- All new features must include unit tests
- Test coverage should be at least 80%
- Include both positive and negative test cases

### Performance
- Avoid N+1 query problems
- Use pagination for large data sets
- Optimize database queries with proper indexing

### Documentation
- Update README.md when adding new features
- Document breaking changes in CHANGELOG.md
- Add inline comments for complex logic

---

**Note:** You can customize these rules based on your project's specific requirements. The AI will follow these rules in addition to the standard code review guidelines.