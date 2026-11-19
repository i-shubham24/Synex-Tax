export interface BlockedCreditParams {
  hsnOrSacCode?: string;
  description?: string;
  isUsedForFurtherSupply?: boolean;
  isUsedForStaffStatutoryDuty?: boolean;
  isPlantAndMachinery?: boolean;
}

export interface BlockedCreditResult {
  isBlocked: boolean;
  clause?: '17(5)(a)' | '17(5)(b)' | '17(5)(c)' | '17(5)(d)' | '17(5)(h)';
  category?: string;
  routingTable: 'Table_4_B_1' | 'Table_4_A_5';
  warningMessage?: string;
}

/**
 * Classifies goods or services under Section 17(5) of the CGST Act
 * and routes ineligible ITC to GSTR-3B Table 4(B)(1) (As per Section 17(5)).
 */
export function classifySection175BlockedCredit(params: BlockedCreditParams): BlockedCreditResult {
  const code = (params.hsnOrSacCode || '').trim();

  // 1. Motor Vehicles (Section 17(5)(a)) - HSN 8702, 8703, 8711
  if (code.startsWith('8702') || code.startsWith('8703') || code.startsWith('8711')) {
    if (params.isUsedForFurtherSupply) {
      return { isBlocked: false, routingTable: 'Table_4_A_5' };
    }
    return {
      isBlocked: true,
      clause: '17(5)(a)',
      category: 'MOTOR_VEHICLE',
      routingTable: 'Table_4_B_1',
      warningMessage: 'Motor vehicles with seating capacity <= 13 are blocked under Section 17(5)(a) unless used for further supply, passenger transport, or driving school.',
    };
  }

  // 2. Food, Catering, Beauty, Health, Club Membership (Section 17(5)(b)) - SAC 9963, 9997, 9996
  if (code.startsWith('9963') || code.startsWith('9997') || code.startsWith('9996')) {
    if (params.isUsedForFurtherSupply || params.isUsedForStaffStatutoryDuty) {
      return { isBlocked: false, routingTable: 'Table_4_A_5' };
    }
    return {
      isBlocked: true,
      clause: '17(5)(b)',
      category: 'FOOD_BEVERAGE_CATERING_CLUB',
      routingTable: 'Table_4_B_1',
      warningMessage: 'Food & beverages, outdoor catering, beauty, or club memberships are blocked under Section 17(5)(b) unless statutory employer obligation or outward supply of same category.',
    };
  }

  // 3. Works Contract for Immovable Property (Section 17(5)(c)) - SAC 9954
  if (code.startsWith('9954')) {
    if (params.isPlantAndMachinery || params.isUsedForFurtherSupply) {
      return { isBlocked: false, routingTable: 'Table_4_A_5' };
    }
    return {
      isBlocked: true,
      clause: '17(5)(c)',
      category: 'WORKS_CONTRACT_IMMOVABLE_PROPERTY',
      routingTable: 'Table_4_B_1',
      warningMessage: 'Works contract services for immovable property (other than plant & machinery) are blocked under Section 17(5)(c).',
    };
  }

  return { isBlocked: false, routingTable: 'Table_4_A_5' };
}
