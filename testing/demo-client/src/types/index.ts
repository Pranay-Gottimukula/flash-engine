// Shared TypeScript types for the Flash Sale client

export type Role = "SELLER" | "CUSTOMER";
export type ProductStatus = "DRAFT" | "UPCOMING" | "ACTIVE" | "SOLD_OUT" | "TERMINATED";
export type OrderStatus = "PENDING" | "COMPLETED" | "FAILED";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
}

export interface Address {
  id: string;
  user_id: string;
  street_address: string;
  city: string;
  state: string;
  zip_code: string;
  is_default: boolean;
  created_at: string;
}

export interface Product {
  id: string;
  seller_id: string;
  name: string;
  description: string;
  image_url: string | null;
  original_mrp: string; // Prisma Decimal serializes as string
  discount_price: string;
  stock_qty: number;
  estimated_demand: number;
  status: ProductStatus;
  sale_starts_at: string | null;
  created_at: string;
  seller?: { id: string; full_name: string };
  _count?: { order_items: number };
}

export interface Favorite {
  user_id: string;
  product_id: string;
  added_at: string;
  product: Product;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  locked_price: string;
  product?: Partial<Product>;
}

export interface Order {
  id: string;
  customer_id: string;
  shipping_address_id: string;
  total_amount: string;
  status: OrderStatus;
  created_at: string;
  items: OrderItem[];
  shipping_address?: Address;
}
