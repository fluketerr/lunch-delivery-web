// ข้อมูลลูกค้าที่ API ส่งกลับมา
export interface CustomerResponse {
  customer_id: number | string;
  name: string;
  phone: string | null;
  address: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
}

// ข้อมูลลูกค้าที่หน้าเว็บและแผนที่ใช้
export interface CustomerRecord {
  id: number | string;
  name: string;
  phone: string;
  address: string;
  coordinates: [number, number] | null;
}
