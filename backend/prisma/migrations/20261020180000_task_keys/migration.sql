-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "taskCounter" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "taskPrefix" TEXT NOT NULL DEFAULT 'GS';

-- Prefix from the first letters of the workspace name, when there are enough.
UPDATE "Workspace"
SET "taskPrefix" = upper(substring(regexp_replace("name", '[^A-Za-z]', '', 'g') FROM 1 FOR 3))
WHERE length(regexp_replace("name", '[^A-Za-z]', '', 'g')) >= 2;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "number" INTEGER;

-- Number existing tasks per workspace in the order they were created.
UPDATE "Task" AS t
SET "number" = numbered.n
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "workspaceId" ORDER BY "createdAt", "id") AS n
  FROM "Task"
) AS numbered
WHERE t."id" = numbered."id";

UPDATE "Workspace" AS w
SET "taskCounter" = counted.max_number
FROM (
  SELECT "workspaceId", MAX("number") AS max_number
  FROM "Task"
  GROUP BY "workspaceId"
) AS counted
WHERE w."id" = counted."workspaceId";

ALTER TABLE "Task" ALTER COLUMN "number" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Task_workspaceId_number_key" ON "Task"("workspaceId", "number");
