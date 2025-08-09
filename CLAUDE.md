# Cupscore Project Rules

## Package Management

- **Use pnpm**: Always use `pnpm` instead of `npm` or `yarn` for package management
  - Install dependencies: `pnpm install`
  - Add packages: `pnpm add package-name`
  - Run scripts: `pnpm run script-name`

## Code Formatting

- **Format after editing**: Run `npx ultracite format` after editing any file to maintain code quality and consistency
- This ensures linting rules are followed and code style is consistent across the project

## Logging

- **Use Pino**: All logging should use the Pino logger from `shared/logger.ts`
- **No console.log**: Replace all `console.log` statements with appropriate logger methods:
  - `logger.info()` for general information
  - `logger.warn()` for warnings
  - `logger.error()` for errors
  - `logger.debug()` for debug information

## Development Workflow

1. Make code changes
2. Run `npx ultracite format` to apply formatting and linting
3. Fix any reported errors or warnings
4. Test changes before committing

## Project Structure

- `uploader/` - Contains data upload utilities and CLI tools
- `crawler/` - Contains web crawlers for different cafe chains
- `convex/` - Contains Convex database schema and mutations
- `shared/` - Shared utilities like logger configuration
- `crawler-outputs/` - Crawler output files (ignored in git)
- `logs/` - Application logs (ignored in git)
