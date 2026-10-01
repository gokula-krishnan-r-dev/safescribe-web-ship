-- CreateTable
CREATE TABLE "DrugClassTaxonomy" (
    "id" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "parentClass" TEXT,
    "therapeuticGroup" TEXT,
    "riskTags" TEXT[],
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugClassTaxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrugCatalog" (
    "id" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "className" TEXT NOT NULL,
    "ingredient" TEXT,
    "commonBrands" TEXT[],
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrugCatalog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrugClassTaxonomy_className_key" ON "DrugClassTaxonomy"("className");

-- CreateIndex
CREATE INDEX "DrugClassTaxonomy_parentClass_idx" ON "DrugClassTaxonomy"("parentClass");

-- CreateIndex
CREATE INDEX "DrugClassTaxonomy_therapeuticGroup_idx" ON "DrugClassTaxonomy"("therapeuticGroup");

-- CreateIndex
CREATE UNIQUE INDEX "DrugCatalog_drugName_key" ON "DrugCatalog"("drugName");

-- CreateIndex
CREATE INDEX "DrugCatalog_className_idx" ON "DrugCatalog"("className");

-- CreateIndex
CREATE INDEX "DrugCatalog_ingredient_idx" ON "DrugCatalog"("ingredient");
