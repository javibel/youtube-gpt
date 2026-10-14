CREATE TABLE extension_batch_operations (
 id TEXT PRIMARY KEY,
 principal TEXT NOT NULL,
 key TEXT NOT NULL UNIQUE,
 "eventId" TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL CHECK(state IN ('pending','complete')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX extension_batch_operations_principal ON extension_batch_operations(principal);
