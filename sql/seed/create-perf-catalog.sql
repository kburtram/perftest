-- Large-catalog fixture (Phase-3 12.2): PerfCatalog database with EXACTLY
-- 10,000 deterministic synthetic tables for Object-Explorer-at-scale
-- scenarios. Separate database so PerfHarness's small OE shape stays intact.
-- Idempotent (drop + recreate). Single batch per statement group; the WHILE
-- loop builds tables t00000..t09999 with a small deterministic shape.
-- Verify after apply: SELECT COUNT(*) FROM PerfCatalog.sys.tables  => 10000.

IF DB_ID(N'PerfCatalog') IS NOT NULL
BEGIN
    ALTER DATABASE PerfCatalog SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE PerfCatalog;
END;

CREATE DATABASE PerfCatalog;

DECLARE @i INT = 0;
DECLARE @sql NVARCHAR(400);
WHILE @i < 10000
BEGIN
    SET @sql = N'CREATE TABLE PerfCatalog.dbo.' + QUOTENAME(N't' + RIGHT(N'0000' + CAST(@i AS NVARCHAR(5)), 5))
             + N' (Id INT NOT NULL PRIMARY KEY, Name NVARCHAR(64) NOT NULL, Value DECIMAL(18,4) NOT NULL);';
    EXEC (@sql);
    SET @i = @i + 1;
END;
