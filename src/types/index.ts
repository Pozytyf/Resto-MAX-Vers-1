export type Role =
  | 'SUPER_ADMIN'
  | 'OWNER'
  | 'MANAGER'
  | 'CASHIER'
  | 'WAITER'
  | 'KITCHEN_BAR';

export type Permission =
  | 'dashboard:read'
  | 'orders:read'
  | 'orders:write'
  | 'pos:use'
  | 'pos:pay'
  | 'pos:refund'
  | 'floor:read'
  | 'floor:write'
  | 'kitchen:read'
  | 'kitchen:write'
  | 'menu:read'
  | 'menu:write'
  | 'stocks:read'
  | 'stocks:write'
  | 'staff:read'
  | 'staff:manage'
  | 'customers:read'
  | 'customers:write'
  | 'reservations:read'
  | 'reservations:write'
  | 'qr:read'
  | 'qr:manage'
  | 'finance:read'
  | 'reports:read'
  | 'settings:read'
  | 'settings:write'
  | 'superadmin:all';

export type RestaurantStatus = 'ACTIVE' | 'TRIAL' | 'SUSPENDED' | 'DELETED';
export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
export type OrderType =
  | 'DINE_IN'
  | 'TAKEAWAY'
  | 'QR_TABLE'
  | 'DELIVERY'
  | 'CLICK_COLLECT';
export type OrderStatus =
  | 'PENDING'
  | 'IN_PREPARATION'
  | 'READY'
  | 'SERVED'
  | 'PAID'
  | 'CANCELLED';
export type StationType = 'KITCHEN' | 'BAR';
export type PaymentMethod =
  | 'CASH'
  | 'ORANGE_MONEY'
  | 'MTN_MOMO'
  | 'WAVE'
  | 'CARD';

export interface UserVenueSummary {
  restaurantId: string;
  name: string;
  slug: string;
  city: string;
  status: RestaurantStatus;
  role: Role;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerified?: boolean;
  hasPin?: boolean;
  restaurantId: string | null;
  restaurantName: string | null;
  restaurantSlug: string | null;
  restaurantStatus: RestaurantStatus | null;
  permissions: Permission[];
  venues?: UserVenueSummary[];
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  tagline: string;
  priceMonthlyXof: number;
  priceYearlyXof: number;
  trialDays: number;
  maxTables: number;
  maxStaff: number;
  maxMenuItems: number;
  isDemoPricing: boolean;
  isFeatured: boolean;
  features: string[];
  active: boolean;
}

export interface DeliveryZone {
  id: string;
  name: string;
  feeXof: number;
  minOrderXof: number;
}

export interface Restaurant {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  currency: string;
  timezone: string;
  taxRatePercent: number;
  serviceFeePercent: number;
  openingHours: string;
  paydunyaMode: 'TEST' | 'LIVE';
  paydunyaConfigured: boolean;
  whatsappEnabled?: boolean;
  whatsappPhoneNumberId?: string;
  whatsappConfigured?: boolean;
  printerSettings?: PrinterSettings;
  storefrontEnabled?: boolean;
  deliveryEnabled?: boolean;
  deliveryZones?: DeliveryZone[];
  pickupSlots?: string[];
  loyaltyEnabled?: boolean;
  loyaltyPointsPer1000Xof?: number;
  loyaltyXofPerPoint?: number;
  status: RestaurantStatus;
  createdAt: string;
  planId?: string;
  planCode?: string;
  planName?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  ownerName?: string;
  ownerEmail?: string;
  ordersCount?: number;
  staffCount?: number;
  tablesCount?: number;
  monthlyVolumeXof?: number;
}

export interface MenuCategory {
  id: string;
  restaurantId: string;
  name: string;
  station: StationType;
  sortOrder: number;
  active: boolean;
}

export interface MenuOption {
  id: string;
  label: string;
  priceDeltaXof: number;
}

export interface MenuOptionGroup {
  id: string;
  name: string;
  required: boolean;
  multiple: boolean;
  choices: MenuOption[];
}

export interface MenuItemRecipeLine {
  id: string;
  menuItemId: string;
  stockId: string;
  stockName: string;
  unit: string;
  quantityPerUnit: number;
  unitCostXof: number;
  currentStockQty: number;
}

export interface MenuItem {
  id: string;
  restaurantId: string;
  categoryId: string;
  categoryName?: string;
  station?: StationType;
  name: string;
  description: string;
  priceXof: number;
  effectivePriceXof?: number;
  promoLabel?: string | null;
  costPriceXof: number;
  imageUrl: string | null;
  available: boolean;
  sortOrder: number;
  options: MenuOption[];
  optionGroups?: MenuOptionGroup[];
  recipeLines?: MenuItemRecipeLine[];
}

export interface MenuCombo {
  id: string;
  restaurantId: string;
  name: string;
  description: string;
  priceXof: number;
  imageUrl: string | null;
  isDailySpecial: boolean;
  active: boolean;
  items: Array<{ label: string; quantity: number; menuItemId?: string }>;
  createdAt: string;
}

export interface Promotion {
  id: string;
  restaurantId: string;
  name: string;
  code: string | null;
  promoType: 'HAPPY_HOUR' | 'PROMO_CODE';
  discountType: 'PERCENT' | 'FIXED_XOF';
  discountValue: number;
  minOrderXof: number;
  days: number[];
  startTime: string;
  endTime: string;
  categoryId: string | null;
  maxUses: number | null;
  usesCount: number;
  active: boolean;
  createdAt: string;
}

export interface PrinterSettings {
  paperWidth: '80mm' | '58mm';
  connectionType: 'BROWSER' | 'NETWORK_ESCPOS' | 'WEB_SERIAL';
  printerHost: string;
  printerPort: number;
  autoPrintReceipt: boolean;
  autoPrintKitchenTicket: boolean;
}

export interface DiningTable {
  id: string;
  restaurantId: string;
  zone: string;
  label: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'RESERVED';
  posX?: number;
  posY?: number;
  shape?: 'ROUND' | 'RECT';
  qrToken?: string;
  qrVersion?: number;
  qrStatus?: 'ACTIVE' | 'REVOKED';
  activeOrderId?: string | null;
  activeOrderTotalXof?: number;
}

export interface OrderItem {
  id: string;
  orderId: string;
  menuItemId: string;
  name: string;
  station: StationType;
  unitPriceXof: number;
  optionsSummary: string;
  optionsDeltaXof: number;
  quantity: number;
  lineTotalXof: number;
  notes: string;
  prepStatus: 'PENDING' | 'PREPARING' | 'READY' | 'SERVED';
}

export interface Order {
  id: string;
  restaurantId: string;
  orderNumber: string;
  orderType: OrderType;
  tableId: string | null;
  tableLabel?: string | null;
  tableZone?: string | null;
  customerName: string;
  customerPhone?: string;
  deliveryAddress?: string;
  deliveryZone?: string;
  deliveryFeeXof?: number;
  scheduledSlot?: string;
  promoCode?: string;
  loyaltyPointsUsed?: number;
  loyaltyPointsEarned?: number;
  status: OrderStatus;
  subtotalXof: number;
  discountXof: number;
  taxXof: number;
  totalXof: number;
  paidXof: number;
  notes: string;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface PaymentRecord {
  id: string;
  restaurantId: string;
  orderId: string;
  orderNumber?: string;
  amountXof: number;
  method: PaymentMethod;
  status: 'PAID' | 'REFUNDED' | 'FAILED';
  mode: 'TEST' | 'LIVE';
  reference: string;
  createdAt: string;
}

export type StockSection = 'KITCHEN' | 'BEVERAGE';

export interface StockItem {
  id: string;
  restaurantId: string;
  name: string;
  unit: string;
  stockSection: StockSection;
  quantity: number;
  minThreshold: number;
  unitCostXof: number;
  supplierName: string;
  updatedAt: string;
  usedInRecipesCount?: number;
}

export interface PurchaseOrderItem {
  id: string;
  purchaseOrderId: string;
  stockId: string;
  stockName: string;
  unit: string;
  quantity: number;
  unitCostXof: number;
  lineTotalXof: number;
}

export interface PurchaseOrder {
  id: string;
  restaurantId: string;
  poNumber: string;
  supplierName: string;
  status: 'DRAFT' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';
  totalCostXof: number;
  notes: string;
  expectedDate: string | null;
  receivedAt: string | null;
  createdAt: string;
  items: PurchaseOrderItem[];
}

export interface StockAlertSettings {
  restaurantId: string;
  inAppEnabled: boolean;
  emailEnabled: boolean;
  recipientEmails: string;
  resolvedRecipients: string[];
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpFrom?: string;
  smtpPassConfigured?: boolean;
  envSmtpConfigured?: boolean;
  updatedAt: string;
}

export interface RestaurantNotification {
  id: string;
  restaurantId: string;
  type: string;
  title: string;
  message: string;
  stockId: string | null;
  emailDispatched: boolean;
  emailRecipients: string;
  emailStatus: 'SENT' | 'QUEUED_NO_SMTP' | 'SKIPPED' | 'FAILED';
  isRead: boolean;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  hasPin?: boolean;
  customPermissions: Permission[];
  createdAt: string;
}

export interface CustomerProfile {
  id: string;
  restaurantId: string;
  fullName: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
  totalSpentXof: number;
  visitsCount: number;
  preferences: string;
  createdAt: string;
}

export interface Reservation {
  id: string;
  restaurantId: string;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string;
  tableId: string | null;
  tableLabel?: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'SEATED' | 'CANCELLED';
  notes: string;
}

export interface SupportTicket {
  id: string;
  restaurantId: string | null;
  restaurantName?: string;
  createdByEmail: string;
  subject: string;
  category: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
  messages: Array<{
    id: string;
    author: string;
    role: string;
    body: string;
    createdAt: string;
  }>;
  createdAt: string;
}

export interface ContactLead {
  id: string;
  leadType: string;
  fullName: string;
  email: string;
  phone: string;
  restaurantName: string;
  city: string;
  message: string;
  status: 'NEW' | 'CONTACTED' | 'CONVERTED' | 'ARCHIVED';
  adminNotes: string;
  convertedRestaurantId: string | null;
  createdAt: string;
}

export interface PlatformInvoice {
  id: string;
  invoiceNumber: string;
  restaurantId: string;
  restaurantName?: string;
  amountXof: number;
  status: string;
  paymentMethod: string;
  mode: string;
  paidAt: string | null;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  actorRole: string;
  restaurantId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  createdAt: string;
}

export interface CashRegisterSession {
  id: string;
  restaurantId: string;
  zNumber: string;
  openedByUserId: string | null;
  openedByName: string;
  openingFloatXof: number;
  openedAt: string;
  closedByUserId: string | null;
  closedByName: string | null;
  closedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  expectedCashXof: number;
  expectedMobileXof: number;
  expectedCardXof: number;
  countedCashXof: number;
  countedMobileXof: number;
  countedCardXof: number;
  varianceXof: number;
  totalSalesXof: number;
  refundsXof: number;
  ordersCount: number;
  notes: string;
}

export interface TableCall {
  id: string;
  restaurantId: string;
  tableId: string;
  tableLabel: string;
  callType: 'WAITER' | 'BILL';
  note: string;
  status: 'PENDING' | 'ACKNOWLEDGED';
  acknowledgedByName: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
}

export interface LoyaltyTransaction {
  id: string;
  restaurantId: string;
  customerId: string;
  orderId: string | null;
  pointsDelta: number;
  reason: string;
  createdAt: string;
}

export interface CustomerReview {
  id: string;
  restaurantId: string;
  orderId: string | null;
  orderNumber: string;
  tableLabel: string;
  customerName: string;
  rating: number;
  serviceRating: number;
  foodRating: number;
  speedRating: number;
  waiterName: string;
  channel: string;
  comment: string;
  reply: string;
  createdAt: string;
}

export interface ReviewSummary {
  total: number;
  avgRating: number;
  avgServiceRating: number;
  avgFoodRating: number;
  avgSpeedRating: number;
  breakdown: Record<number, number>;
  waiterStats: Array<{
    waiterName: string;
    count: number;
    avgServiceRating: number;
    avgRating: number;
  }>;
}

export interface InventoryCountLine {
  id: string;
  inventoryCountId: string;
  stockId: string;
  stockName: string;
  stockSection?: StockSection;
  unit: string;
  expectedQty: number;
  countedQty: number;
  varianceQty: number;
  unitCostXof: number;
  varianceXof: number;
}

export interface InventoryCount {
  id: string;
  restaurantId: string;
  title: string;
  stockSection: 'ALL' | StockSection;
  status: 'VALIDATED';
  notes: string;
  totalVarianceXof: number;
  createdByName: string;
  validatedAt: string | null;
  createdAt: string;
  lines: InventoryCountLine[];
}

export interface StaffShift {
  id: string;
  restaurantId: string;
  userId: string;
  staffName: string;
  role: Role;
  shiftDate: string;
  startTime: string;
  endTime: string;
  notes: string;
  createdAt: string;
}

export interface StaffTimeClock {
  id: string;
  restaurantId: string;
  userId: string;
  staffName: string;
  role: Role;
  clockInAt: string;
  clockOutAt: string | null;
  durationMinutes: number;
  notes: string;
}

export interface B2bInvoiceLine {
  description: string;
  quantity: number;
  unitPriceXof: number;
  lineTotalXof: number;
}

export interface B2bInvoice {
  id: string;
  restaurantId: string;
  invoiceNumber: string;
  docType: 'PROFORMA' | 'INVOICE';
  clientName: string;
  clientCompany: string;
  clientTaxId: string;
  clientEmail: string;
  clientPhone: string;
  clientAddress: string;
  items: B2bInvoiceLine[];
  subtotalHtXof: number;
  taxRatePercent: number;
  taxXof: number;
  totalTtcXof: number;
  status: 'DRAFT' | 'SENT' | 'ACCEPTED' | 'PAID' | 'CANCELLED';
  dueDate: string | null;
  notes: string;
  createdAt: string;
}

