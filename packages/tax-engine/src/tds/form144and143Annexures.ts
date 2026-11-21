/**
 * Annexures of Protean's file formats for Form 144 (27Q, non-residents) and Form 143 (27EQ, TCS),
 * version 1.1 for Tax Year 2026-27 on: "Form Number 144-27Q - Q1 to Q4_22072026.xlsx" and
 * "Form Number 143-27EQ - Q1 to Q4_22072026.xlsx" (tinpan.proteantech.in, read 21 Nov 2026).
 * Codes and section references are verbatim; a few long Form 143 descriptions are shortened for display.
 * Replace from the new files when Protean revises them.
 */

// ------------------------------------------------------------------ Form 144

/** Annexure 2 of Form 144: section codes for payments to non-residents. */
export const FORM_144_SECTION_CODES: Record<string, string> = {
  '1004': '392(7)',
  '1039': '393(2) [Table: Sl. No. 1]',
  '1040': '393(2) [Table: Sl. No. 2]',
  '1041': '393(2) [Table: Sl. No. 3]',
  '1042': '393(2) [Table: Sl. No. 4.E(a)]',
  '1043': '393(2) [Table: Sl. No. 4.E(b)]',
  '1044': '393(2) [Table: Sl. No. 5]',
  '1045': '393(2) [Table: Sl. No.6.E(a)]',
  '1046': '393(2) [Table: Sl. No.6.E(b)]',
  '1047': '393(2) [Table: Sl. No. 7]',
  '1048': '393(2) [Table: Sl. No. 8]',
  '1049': '393(2) [Table: Sl. No. 9]',
  '1050': '393(2) [Table: Sl. No. 10]',
  '1051': '393(2) [Table: Sl. No. 11]',
  '1052': '393(2) [Table: Sl. No. 12]',
  '1053': '393(2) [Table: Sl. No. 13]',
  '1054': '393(2) [Table: Sl. No. 14]',
  '1055': '393(2) [Table: Sl. No. 15]',
  '1056': '393(2) [Table: Sl. No. 16]',
  '1057': '393(2) [Table: Sl. No. 17]',
  '1058': '393(3) [Table: Sl. No. 1]',
  '1059': '393(3) [Table: Sl. No. 1] Note 2',
  '1060': '393(3) [Table: Sl. No. 2]',
  '1061': '393(3) [Table: Sl. No. 2] Note 2',
  '1062': '393(3) [Table: Sl. No. 3]',
  '1063': '393(3) [Table: Sl. No. 4]',
  '1064': '393(3) [Table: Sl. No. 5.D(a)]',
  '1065': '393(3) [Table: Sl. No. 5.D(b)]',
  '1066': '393(3) [Table: Sl. No. 6]',
  '1067': '393(3) [Table: Sl. No. 7]',
};

const ALL_144 = '1004,1039,1040,1041,1042,1043,1044,1045,1046,1047,1048,1049,1050,1051,1052,1053,1054,1055,1056,1057,1058,1060,1062,1063,1064,1065,1066,1067';

/** Annexure 6 of Form 144: reason flags and the section codes each may be used with. */
export const FORM_144_REASON_FLAGS: Record<string, { description: string; sections: ReadonlySet<string> }> = Object.fromEntries(
  (
    [
      ['A', '“Lower deduction” or “no deduction” is on account of a certificate under section 395(1) and 395(2)', ALL_144],
      ['C', 'Deduction is on higher rate under section 397(2) on account of non-furnishing of PAN', ALL_144],
      ['G', 'No deduction is made on interest paid by an Offshore Banking Unit as per the provisions of section 393(8)', '1057'],
      ['H', 'No deduction in view of section 393(4) [Table: Sl. No. 17] for income paid to a specified fund exempt under Schedule VI [Table: Sl. Nos. 1 to 4]', '1056'],
      ['I', 'No deduction in view of section 393(4) [Table: Sl. No. 16] for capital gains on transfer of securities referred to in section 210', '1055'],
      ['N', 'No deduction on account of payment made to a person referred to in section 393(4) [Table: Sl. No. 18] or a notification', '1064,1065'],
      ['O', 'Distributed income referred to in section 223, of the nature referred to in Schedule V [Table: Sl. No. 3.B(b)]', '1046'],
      ['Y', 'No deduction on account of payment below threshold limit as specified in the Income-tax Act, 2025', '1004,1058,1059,1062,1063,1066,1067'],
      ['Z', 'No deduction or lower deduction in view of a notification issued under section 400(1)', '1057'],
    ] as Array<[string, string, string]>
  ).map(([f, description, codes]) => [f, { description, sections: new Set(codes.split(',')) }]),
);

/** Annexure 8: status of the deductee (Form 144) or collectee code (Form 143). Same list in both. */
export const PAYEE_STATUS_CODES: Record<string, string> = {
  '1': 'Company',
  '2': 'Individual',
  '3': 'Hindu undivided family',
  '4': 'Association of Persons (AOP) except in case of AOP consisting of only companies as its members',
  '5': 'Association of Persons (AOP) consisting of only companies as its members',
  '6': 'Co-operative society',
  '7': 'Firm',
  '8': 'Body of individuals',
  '9': 'Artificial juridical person referred to in clause (g) of sub-section (77) of section 2 of the Income-tax Act, 2025',
  '10': 'Others',
};

/** Annexure 9 of Form 144: nature of remittance codes. */
export const REMITTANCE_NATURES: Record<string, string> = {
  '16': 'Dividend income referred to in the section 207(1) [Table: Sl. No.2]',
  '21': 'Fees for Technical Services/ Fees for included services where the agreement is made after the 31st March, 1976',
  '27': 'Interest income',
  '28': 'Investment income',
  '49': 'Royalty where the agreement is made after the 31st March, 1976',
  '66': 'Long term capital gains referred to in section 214 [Table: Sl. No. 2]',
  '67': 'Long term capital gains referred to in section 197(1)',
  '68': 'LTCG other than those specifically listed under Schedule II, Sl. No. 14 and Sl. No. 17 [related to section 10(36) of IT ACT-1961]',
  '69': 'Long term capital gains referred to in section 198 exceeding one lakh twenty-five thousand rupees,',
  '70': 'Short term capital gains referred to in section 196',
  '71': 'Long Term Capital Gains arising from transfer of Units referred to in Section 208',
  '72': 'Long-term capital gains arising from the transfer of bonds or Global Depository Receipts referred to in section 209',
  '73': 'Dividend income referred to in the in the section 207(1) [Table: Sl. No.1]',
  '74': 'Fees for Technical Services/ Fees for included services where the agreement is made after the 29th February, 1964 but before the 1st April, 1976',
  '75': 'Royalty where the agreement is made after the 31st March, 1961 but before the 1st April, 1976',
  '99': 'Other income',
};

const CAPITAL = ['27', '16', '73', '66', '67', '68', '69', '70'];
/** Annexure 9: which nature codes each section allows. Sections not listed take no nature code. */
export const REMITTANCE_BY_SECTION: Record<string, readonly string[]> = {
  '1040': ['27'],
  '1041': ['27'],
  '1042': ['27'],
  '1043': ['27'],
  '1044': ['27'],
  '1045': ['27'],
  '1046': ['16', '73'],
  '1048': CAPITAL,
  '1049': CAPITAL,
  '1050': CAPITAL,
  '1051': ['27', '16', '73'],
  '1052': ['71'],
  '1053': ['27', '16', '73'],
  '1054': ['72'],
  '1055': CAPITAL,
  '1056': CAPITAL,
  '1057': ['27', '73', '16', '28', '66', '67', '68', '69', '70', '21', '74', '49', '75', '99'],
};

/** Annexure 10 of Form 144: country codes (113 is India). */
export const COUNTRY_CODES: Record<string, string> = Object.fromEntries(
  "01=AFGHANISTAN;02=AKROTIRI;03=ALBANIA;04=ALGERIA;05=AMERICAN SAMOA;06=ANDORRA;07=ANGOLA;08=ANGUILLA;09=ANTARCTICA;10=ANTIGUA AND BARBUDA;11=ARGENTINA;12=ARMENIA;13=ARUBA;14=ASHMORE AND CARTIER ISLANDS;15=AUSTRALIA;16=AUSTRIA;17=AZERBAIJAN;18=BAHRAIN;19=BAILIWICK OF GUERNSEY;20=BAILIWICK OF JERSEY;21=BAKER ISLAND;22=BANGLADESH;23=BARBADOS;24=BELARUS;25=BELGIUM;26=BELIZE;27=BENIN PORTO;28=BERMUDA;29=BHUTAN;30=BOLIVIA;31=BOSNIAAND HERZEGOVINA;32=BOTSWANA;33=BOUVET ISLAND;34=BRAZIL;35=BRITISH INDIAN OCEAN TERRITORY;36=BRUNEI;37=BULGARIA;38=BURKINA FASO;39=BURUNDI;40=CAMBODIA;41=CAMEROON;42=CANADA;43=CAPE VERDE;44=CAYMAN ISLANDS;45=CENTRAL AFRICAN REPUBLIC;46=CHAD;47=CHILE;48=CHINA;49=CHRISTMAS ISLAND;50=CLIPPERTON ISLAND;51=COCOS (KEELING) ISLANDS;52=COLOMBIA;53=COMMONWEALTH OF PUERTO RICO;54=COMMONWEALTH OF THE NORTHERN MARIANA ISLANDS;55=COMOROS;56=CONGO,DEMOCRATIC REPUBLIC OF THE;57=CONGO,REPUBLIC OF THE;58=COOK ISLANDS;59=CORAL SEA ISLANDS;60=CORAL SEA ISLANDS TERRITORY;61=COSTA RICA;62=COTE D'IVOIRE;63=CROATIA;64=CUBA;65=CYPRUS;66=CZECH REPUBLIC;67=DENMARK;68=DEPARTMENTAL COLLECTIVITY OF MAYOTTE;69=DHEKELIA;70=DJIBOUTI;71=DOMINICA;72=DOMINICAN REPUBLIC;73=EAST TIMOR (TIMORLASTE);74=ECUADOR;75=EGYPT;76=ELSALVADOR;77=EQUATORIAL GUINEA;78=ERITREA;79=ESTONIA;80=ETHIOPIA;81=FALKLAND ISLANDS (ISLAS MALVINAS);82=FAROE ISLANDS;83=FIJI;84=FINLAND;85=FRANCE;86=FRENCH GUIANA;87=FRENCH POLYNESIA;88=FRENCH SOUTHERN ISLANDS;89=GABON;90=GEORGIA;91=GERMANY;92=GEURNSEY;93=GHANA;94=GIBRALTAR;95=GREECE;96=GREENLAND;97=GRENADA;98=GUADELOUPE;100=GUAM;101=GUATEMALA;102=GUERNSEY;103=GUINEA;104=GUINEABISSAU;105=GUYANA;106=HAITI;107=HEARD ISLAND AND MCDONALD ISLANDS;108=HONDURAS;109=HONG KONG;110=HOWLAND ISLAND;111=HUNGARY;112=ICELAND;113=INDIA;114=INDONESIA;115=IRAN;116=IRAQ;117=IRELAND;118=ISLE OF MAN;119=ISRAEL;120=ITALY;121=JAMAICA;122=JAN MAYEN;123=JAPAN;124=JARVIS ISLAND;125=JERSEY;126=JOHNSTON ATOLL;127=JORDAN;128=KAZAKHSTAN;129=KENYA;130=KINGMAN REEF;131=KIRIBATI;132=KOREA, NORTH;133=KOREA, SOUTH;134=KOSOVO;135=KUWAIT;136=KYRGYZSTAN;137=LAOS;138=LATVIA;139=LEBANON;140=LESOTHO;141=LIBERIA;142=LIBYA;143=LIECHTENSTEIN;144=LITHUANIA;145=LUXEMBOURG;146=MACAU;147=MACEDONIA;148=MADAGASCAR;149=MALAWI;150=MALAYSIA;151=MALAYSIA (LABUAN);152=MALDIVES;153=MALI;154=MALTA;155=MARSHALLISLANDS;156=MARTINIQUE;157=MAURITANIA;158=MAURITIUS;159=MAYOTTE;160=UNITED MEXICAN STATES;161=MICRONESIA, FEDERATED STATES OF;162=MIDWAY ISLANDS;163=MOLDOVA;164=MONACO;165=MONGOLIA;166=MONTENEGRO;167=MONTSERRAT;168=MOROCCO;169=MOZAMBIQUE;170=MYANMAR (BURMA);171=NAMIBIA;172=NAURU;173=NAVASSA ISLAND;174=NEPAL;175=NETHERLANDS;176=NETHERLANDS ANTILLES;177=NEW CALEDONIA;178=NEWZEALAND;179=NICARAGUA;180=NIGER;181=NIGERIA;182=NIUE;183=NORFOLK ISLAND;184=NORTHERN MARIANA ISLANDS;185=NORWAY;186=OMAN;187=PAKISTAN;188=PALAU;189=PALMYRA ATOLL;190=PANAMA;191=PAPUA NEW GUINEA;192=PARACEL ISLANDS;193=PARAGUAY;194=PERU;195=PHILIPPINES;196=PITCAIRN ISLANDS;197=PITCAIRN, HENDERSON, DUCIE, AND OENO ISLANDS;198=POLAND;199=PORTUGAL;200=PUERTO RICO;201=QATAR;202=REUNION;203=ROMANIA;204=RUSSIA;205=RWANDA;206=SAINT BARTHELEMY;207=SAINT HELENA;208=SAINT KITTS AND NEVIS;209=SAINT LUCIA;210=SAINT MARTIN;211=SAINT PIERRE AND MIQUELON;212=SAINT VINCENT AND THE GRENADINES;213=SAMOA;214=SANMARINO;215=SAO TOME AND PRINCIPE;216=SAUDI ARABIA;217=SENEGAL;218=SERBIA;219=SEYCHELLES;220=SIERRA LEONE;221=SINGAPORE;222=SLOVAKIA;223=SLOVENIA;224=SOLOMON ISLANDS;225=SOMALIA;226=SOUTH AFRICA;227=SOUTH GEORGIA AND SOUTH SANDWICH ISLANDS;228=SPRATLY ISLANDS;229=SPAIN;230=SRI LANKA;231=ST. VINCENT & GRENADINES;232=SUDAN;233=SURINAME;234=SVALBARD;235=SWAZILAND;236=SWEDEN;237=SWITZERLAND;238=SYRIA;239=TAIWAN;240=TAJIKISTAN;241=TANZANIA;242=TERRITORIAL COLLECTIVITY OF ST. PIERRE & MIQUELON;243=TERRITORY OF AMERICAN SAMOA;244=TERRITORY OF ASHMORE AND CARTIER ISLANDS;245=TERRITORY OF CHRISTMAS ISLAND;246=TERRITORY OF COCOS (KEELING) ISLANDS;247=TERRITORY OF GUAM;248=TERRITORY OF HEARD ISLAND & MCDONALD ISLANDS;249=TERRITORY OF NORFOLK ISLAND;250=THAILAND;251=THE BAHAMAS;252=THE GAMBIA;253=TOGO;254=TOKELAU;255=TONGA;256=TRINIDAD AND TOBAGO;257=TUNISIA;258=TURKEY;259=TURKMENISTAN;260=TURKS AND CAICOS ISLANDS;261=TUVALU;262=UGANDA;263=UKRAINE;264=UNITED ARAB EMIRATES;265=UNITED KINGDOM;266=UNITED STATES VIRGIN ISLANDS;267=UNITED STATES OF AMERICA;268=URUGUAY;269=UZBEKISTAN;270=VANUATU;271=VATICAN CITY (HOLYSEE);272=VENEZUELA;273=VIETNAM;274=VIRGIN ISLANDS, BRITISH;275=VIRGIN ISLANDS, U.S.;276=WAKE ISLAND;277=WALLIS AND FUTUNA;278=WESTERN SAHARA;279=YEMEN;280=ZAMBIA;281=ZIMBABWE;282=COMBODIA;283=CONGO;284=IVORY COAST;285=WEST INDIES;286=BRITISH VIRGIN ISLANDS"
    .split(';')
    .map((p) => p.split('=') as [string, string]),
);

// ------------------------------------------------------------------ Form 143 (TCS)

/** Annexure 2 of Form 143: collection codes. */
export const FORM_143_COLLECTION_CODES: Record<string, string> = {
  '1068': 'Sale of alcoholic liquor for human consumption.',
  '1069': 'Sale of tendu leaves',
  '1070': 'Sale of timber obtained under a forest lease',
  '1071': 'Sale of timber obtained by any mode other than a forest lease',
  '1072': 'Sale of any other forest produce (not being timber or tendu leaves) obtained under a forest lease.',
  '1073': 'Sale of Scrap',
  '1074': 'Sale of minerals, being coal or lignite or iron ore.',
  '1075': 'Sale consideration exceeding threshold limit in case of sale of motor vehicle',
  '1076': 'Sale of wrist watch above the threshold',
  '1077': 'Sale of art piece such as antiques, painting, sculpture above the threshold',
  '1078': 'Sale of collectibles such as coin, stamp above the threshold',
  '1079': 'Sale of yacht, rowing boat, canoe, helicopter above the threshold',
  '1080': 'Sale of pair of sunglasses above the threshold',
  '1081': 'Sale of bag such as handbag, purse above the threshold',
  '1082': 'Sale of pair of shoes above the threshold',
  '1083': 'Sale of sportswear and equipment such as golf kit, ski-wear above the threshold',
  '1084': 'Sale of home theatre system above the threshold',
  '1085': 'Sale of horse for horse racing in race clubs and horse for polo above the threshold',
  '1086': 'Remittance under the Liberalised Remittance Scheme above the threshold, for education (394(1) [Table: Sl. No. 7.D(a)])',
  '1087': 'Remittance under the Liberalised Remittance Scheme above the threshold, for other purposes (394(1) [Table: Sl. No. 7.D(b)])',
  '1088': 'Sale of overseas tour programme package (394(1) [Table: Sl. No. 8.D(a)])',
  '1089': 'Sale of overseas tour programme package (394(1) [Table: Sl. No. 8.D(b)])',
  '1090': 'Use of parking lot for the purpose of business, excluding mining and quarrying of mineral oil',
  '1091': 'Use of toll plaza for the purpose of business, excluding mining and quarrying of mineral oil',
  '1092': 'Use of mine or quarry for the purpose of business, excluding mining and quarrying of mineral oil',
};

const ALL_143 = Object.keys(FORM_143_COLLECTION_CODES).join(',');
/** Field 32 of the Form 143 collectee record and its Annexure 6 table. */
export const FORM_143_REASON_FLAGS: Record<string, { description: string; sections: ReadonlySet<string> }> = Object.fromEntries(
  (
    [
      ['A', 'Lower collection on account of a certificate under section 395(3)', ALL_143],
      ['B', 'Non-collection on account of a declaration under section 394(2)', '1068,1069,1070,1071,1072,1073,1074'],
      ['C', 'Collection at higher rate under section 397(2) on account of non-furnishing of PAN', ALL_143],
      ['F', 'No collection on account of section 394(5) or section 402(6) [Table: Sl. No. 4 & 5, Column D]', '1086,1087,1088,1089'],
      ['K', 'No collection as per the provisions of section 394(4)', '1086,1087'],
      ['Y', 'No collection on account of receipt below threshold limit in section 394(1) [Table: Sl. No. 7]', '1086,1087'],
      ['Z', 'No collection or lower collection in view of a notification issued under section 400(1)', '1075,1076,1077,1078,1079,1080,1081,1082,1083,1084,1085'],
    ] as Array<[string, string, string]>
  ).map(([f, description, codes]) => [f, { description, sections: new Set(codes.split(',')) }]),
);
