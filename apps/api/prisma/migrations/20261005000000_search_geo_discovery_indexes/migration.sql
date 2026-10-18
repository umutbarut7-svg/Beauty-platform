CREATE INDEX "Business_isPublic_status_name_idx" ON "Business"("isPublic", "status", "name");
CREATE INDEX "Business_isPublic_status_latitude_longitude_idx" ON "Business"("isPublic", "status", "latitude", "longitude");
CREATE INDEX "Location_isActive_city_district_idx" ON "Location"("isActive", "city", "district");
CREATE INDEX "Location_isActive_latitude_longitude_idx" ON "Location"("isActive", "latitude", "longitude");
CREATE INDEX "Staff_isActive_acceptsBookings_displayName_idx" ON "Staff"("isActive", "acceptsBookings", "displayName");
CREATE INDEX "Service_isActive_isBookable_price_durationMinutes_idx" ON "Service"("isActive", "isBookable", "price", "durationMinutes");
