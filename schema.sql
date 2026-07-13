-- IRIS online store — MySQL schema
-- Import with:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS iris_store CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE iris_store;

CREATE TABLE IF NOT EXISTS categories (
  name VARCHAR(100) PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS products (
  id         VARCHAR(40) PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  category   VARCHAR(100) NOT NULL,
  price      DECIMAL(10,2) NOT NULL DEFAULT 0,
  stock      INT NOT NULL DEFAULT 0,
  sizes      JSON NOT NULL,
  colors     JSON NOT NULL,
  icon       VARCHAR(40) DEFAULT 'ic-dress',
  image      VARCHAR(500) DEFAULT '',
  badge      VARCHAR(100) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id         VARCHAR(20) PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  phone      VARCHAR(50) NOT NULL,
  delivery   ENUM('delivery','pickup') NOT NULL,
  address    VARCHAR(500),
  payment    VARCHAR(100),
  total      DECIMAL(10,2) NOT NULL,
  status     VARCHAR(30) NOT NULL DEFAULT 'მოლოდინში',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  order_id   VARCHAR(20) NOT NULL,
  product_id VARCHAR(40) NOT NULL,
  name       VARCHAR(200) NOT NULL,
  size       VARCHAR(30),
  color      VARCHAR(50),
  price      DECIMAL(10,2) NOT NULL,
  qty        INT NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- Starter data so the store isn't empty on first run
INSERT IGNORE INTO categories (name) VALUES
 ('კაბები'),('ქურთუკები'),('ჯინსი'),('პერანგები'),('სვიტრები'),('ჩანთები'),('ქვედაბოლოები');

INSERT IGNORE INTO products (id,name,category,price,stock,sizes,colors,icon,image,badge) VALUES
 ('p1','ვიოლეტისფერი მაქსი კაბა','კაბები',245,14,'["XS","S","M","L"]','["იისფერი","შავი"]','ic-dress','','ბესტსელერი'),
 ('p2','ოვერსაიზ ეშმაკი პალტო','ქურთუკები',390,6,'["M","L","XL"]','["ნაცრისფერი","შავი"]','ic-coat','','ახალი'),
 ('p3','სტრეიჩ სტრეიტ ჯინსი','ჯინსი',165,20,'["30","32","34","36"]','["ლურჯი","შავი"]','ic-jeans','',''),
 ('p4','აბრეშუმის პერანგი','პერანგები',180,9,'["S","M","L"]','["ხავერდისფერი","თეთრი"]','ic-blouse','','ახალი'),
 ('p5','პლისირებული ქვედაბოლო','ქვედაბოლოები',150,11,'["XS","S","M"]','["იისფერი","ბორდო"]','ic-skirt','',''),
 ('p6','ნაქსოვი სვიტერი','სვიტრები',175,17,'["S","M","L","XL"]','["რუხი","მწვანე"]','ic-sweater','','ბესტსელერი'),
 ('p7','ტყავის მინი ჩანთა','ჩანთები',220,8,'["ერთი ზომა"]','["შავი","იისფერი"]','ic-bag','','ახალი'),
 ('p8','ვინტაჟ დენიმ ჟაკეტი','ქურთუკები',210,0,'["S","M","L"]','["ღია ლურჯი"]','ic-coat','','');
