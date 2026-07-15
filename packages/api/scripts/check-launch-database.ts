import prisma from '../src/lib/prisma';
import { getLaunchDatabaseSchemaIssues } from '../src/lib/launchDatabaseReadiness';

async function main() {
  const issues = await getLaunchDatabaseSchemaIssues();
  if (issues.length > 0) {
    for (const issue of issues) console.error(`${issue.key}: ${issue.message}`);
    process.exitCode = 1;
    return;
  }
  console.log('Launch database schema: ready');
}

main()
  .catch((error) => {
    console.error(`Launch database schema check failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
