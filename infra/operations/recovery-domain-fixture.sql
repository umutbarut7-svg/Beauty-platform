-- Generated CI fixture only. Caller binds a disposable synthetic database.
INSERT INTO "Business" (id,name,slug,"updatedAt") VALUES ('fixture-supplier','Generated supplier','generated-supplier',now());
INSERT INTO "Customer" (id,"userId","updatedAt") VALUES ('fixture-customer','fixture-owner-a',now());
INSERT INTO "ServiceCategory" (id,"businessId",name,slug,"updatedAt") VALUES
 ('fixture-category','fixture-business','Current category','current-category',now()),
 ('supplier-category','fixture-supplier','Supplier category','supplier-category',now());
INSERT INTO "Service" (id,"businessId","categoryId",name,slug,"durationMinutes",price,"updatedAt") VALUES
 ('fixture-service','fixture-business','fixture-category','Renamed service','generated-service',30,100,now()),
 ('supplier-service','fixture-supplier','supplier-category','Supplier service','supplier-service',30,100,now());
INSERT INTO "Appointment" (id,"businessId","customerId","serviceId","startsAt","endsAt",status,price,currency,"updatedAt") VALUES
 ('fixture-appointment','fixture-business','fixture-customer','fixture-service',now()-interval '1 hour',now()-interval '30 minutes','COMPLETED',100,'TRY',now()),
 ('supplier-appointment','fixture-supplier','fixture-customer','supplier-service',now()-interval '1 hour',now()-interval '30 minutes','COMPLETED',100,'TRY',now());
INSERT INTO "CatalogProduct" (id,"businessId",sku,name,price,currency,unit,"stockQuantity","updatedAt") VALUES
 ('fixture-ml','fixture-business','GENERATED.ML','Renamed liquid',25,'TRY','ML',8.75,now()),
 ('fixture-unit','fixture-business','GENERATED.UNIT','Generated unit',30,'TRY','UNIT',4,now()),
 ('supplier-product','fixture-supplier','SUPPLIER.UNIT','Renamed supplier product',40,'TRY','UNIT',0,now());
-- A historical quote must survive later product/profile unlisting and repricing.
UPDATE "CatalogProduct" SET "isActive"=false, "b2bAvailable"=false WHERE id='supplier-product';
INSERT INTO "SupplierProfile" ("businessId",kind,description,"isListed","updatedAt") VALUES
 ('fixture-supplier','WHOLESALER','Generated historical supplier',false,now());
INSERT INTO "B2BQuoteRequest" (id,"buyerBusinessId","supplierBusinessId","productId","productName",sku,unit,quantity,"buyerNote",status,"quotedUnitPrice",currency,"requestedBy","respondedBy","keyHash","requestHash",revision,"updatedAt") VALUES
 ('fixture-quote','fixture-business','fixture-supplier','supplier-product','Original supplier product','SUPPLIER.UNIT','UNIT',2,'Generated quote','QUOTED',35,'TRY','fixture-owner-a','fixture-owner-b',repeat('8',64),repeat('9',64),1,now());
INSERT INTO "InventoryOperation" (id,"businessId","actorId","keyHash","requestHash",type,response) VALUES
 ('fixture-import','fixture-business','fixture-owner-a',repeat('1',64),repeat('1',64),'IMPORT','{"ids":["fixture-ml","fixture-unit"]}'),
 ('supplier-import','fixture-supplier','fixture-owner-b',repeat('1',64),repeat('1',64),'IMPORT','{"ids":["supplier-product"]}'),
 ('fixture-in-ml','fixture-business','fixture-owner-a',repeat('2',64),repeat('2',64),'MOVEMENT','{"movementId":"move-in-ml","productId":"fixture-ml","quantityAfter":"10","unit":"ML"}'),
 ('fixture-in-unit','fixture-business','fixture-owner-a',repeat('3',64),repeat('3',64),'MOVEMENT','{"movementId":"move-in-unit","productId":"fixture-unit","quantityAfter":"5","unit":"UNIT"}'),
 ('fixture-parent','fixture-business','fixture-owner-a',encode(sha256(convert_to('appointment-consumption','UTF8')||decode('00','hex')||convert_to('fixture-appointment','UTF8')),'hex'),repeat('4',64),'MOVEMENT','{}');
INSERT INTO "InventoryOperation" (id,"businessId","actorId","keyHash","requestHash",type,response)
SELECT 'fixture-child-'||product,"businessId",'fixture-owner-a',
 encode(sha256(convert_to('appointment-material','UTF8')||decode('00','hex')||convert_to('fixture-appointment','UTF8')||decode('00','hex')||convert_to(id,'UTF8')),'hex'),repeat('5',64),'MOVEMENT',
 jsonb_build_object('kind','APPOINTMENT_MATERIAL','appointmentId','fixture-appointment','serviceId','fixture-service','serviceName','Original service','parentOperationId','fixture-parent',
   'productId',id,'productName','Original product','sku',sku,'unit',unit,'quantity',quantity,'quantityAfter',quantity_after,'movementId','move-out-'||product)
FROM "CatalogProduct" CROSS JOIN (VALUES ('ml','fixture-ml','1.25','8.75'),('unit','fixture-unit','1','4')) AS items(product,product_id,quantity,quantity_after)
WHERE id=product_id;
INSERT INTO "InventoryMovement" (id,"businessId","productId","operationId",direction,quantity,"quantityAfter",reason) VALUES
 ('move-in-ml','fixture-business','fixture-ml','fixture-in-ml','IN',10,10,'Generated stock'),
 ('move-in-unit','fixture-business','fixture-unit','fixture-in-unit','IN',5,5,'Generated stock'),
 ('move-out-ml','fixture-business','fixture-ml','fixture-child-ml','OUT',1.25,8.75,'Generated consumption'),
 ('move-out-unit','fixture-business','fixture-unit','fixture-child-unit','OUT',1,4,'Generated consumption');
UPDATE "InventoryOperation" SET response=jsonb_build_object(
 'kind','APPOINTMENT_CONSUMPTION','appointmentId','fixture-appointment','serviceId','fixture-service','serviceName','Original service',
 'operationId','fixture-parent','reason','Generated consumption','createdAt','2026-11-12T00:00:00Z','items',
 (SELECT jsonb_agg(response-ARRAY['kind','appointmentId','serviceId','serviceName','parentOperationId'] ORDER BY id)
  FROM "InventoryOperation" WHERE id IN ('fixture-child-ml','fixture-child-unit'))
) WHERE id='fixture-parent';
