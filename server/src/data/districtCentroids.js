/**
 * Approximate district HQ coordinates (decimal degrees) for rough farm placement
 * and nearby-distance correction when GPS is not field-verified.
 * Keys: `${normalizeKey(state)}|${normalizeKey(districtName)}` — must match DB `districts.name` + state.
 */
import { normalizeKey } from '../services/villageData.js';

/** @type {[string, string, number, number][]} */
const ROWS = [
  // Andhra Pradesh
  ['Andhra Pradesh', 'Anantapur', 14.6819, 77.6003],
  ['Andhra Pradesh', 'Chittoor', 13.2172, 79.1003],
  ['Andhra Pradesh', 'East Godavari', 17.0005, 81.804],
  ['Andhra Pradesh', 'Guntur', 16.2991, 80.4575],
  ['Andhra Pradesh', 'Krishna', 16.1878, 81.1389],
  ['Andhra Pradesh', 'Kurnool', 15.8281, 78.0373],
  ['Andhra Pradesh', 'Nellore', 14.4426, 79.9865],
  ['Andhra Pradesh', 'Prakasam', 15.5057, 80.0499],
  ['Andhra Pradesh', 'Srikakulam', 18.2949, 83.8938],
  ['Andhra Pradesh', 'Visakhapatnam', 17.6868, 83.2185],
  ['Andhra Pradesh', 'Vizianagaram', 18.1066, 83.3956],
  ['Andhra Pradesh', 'West Godavari', 16.7107, 81.1056],
  ['Andhra Pradesh', 'YSR Kadapa', 14.4673, 78.8242],
  // Telangana
  ['Telangana', 'Adilabad', 19.6713, 78.5244],
  ['Telangana', 'Hyderabad', 17.385, 78.4867],
  ['Telangana', 'Karimnagar', 18.4386, 79.1288],
  ['Telangana', 'Khammam', 17.2473, 80.1514],
  ['Telangana', 'Mahabubnagar', 16.7488, 77.9856],
  ['Telangana', 'Medak', 17.6199, 78.0854],
  ['Telangana', 'Nalgonda', 17.0543, 79.267],
  ['Telangana', 'Nizamabad', 18.6725, 78.0941],
  ['Telangana', 'Rangareddy', 17.2543, 78.5268],
  ['Telangana', 'Warangal', 17.9784, 79.5941],
  // Karnataka
  ['Karnataka', 'Bagalkote', 16.1867, 76.6161],
  ['Karnataka', 'Ballari', 15.1394, 76.9214],
  ['Karnataka', 'Belagavi', 15.8497, 74.4977],
  ['Karnataka', 'Bengaluru Rural', 13.2981, 77.7066],
  ['Karnataka', 'Bengaluru South', 12.86, 77.57],
  ['Karnataka', 'Bengaluru Urban', 12.9719, 77.5937],
  ['Karnataka', 'Bidar', 17.9104, 77.5199],
  ['Karnataka', 'Chamarajanagar', 11.9261, 76.9397],
  ['Karnataka', 'Chikkaballapura', 13.4325, 77.7275],
  ['Karnataka', 'Chikkamagaluru', 13.3161, 75.772],
  ['Karnataka', 'Chitradurga', 14.2256, 76.398],
  ['Karnataka', 'Dakshina Kannada', 12.9141, 74.856],
  ['Karnataka', 'Davanagere', 14.4644, 75.9218],
  ['Karnataka', 'Dharwad', 15.4589, 75.0078],
  ['Karnataka', 'Gadag', 15.4298, 75.6297],
  ['Karnataka', 'Hassan', 13.0033, 76.1004],
  ['Karnataka', 'Haveri', 14.7936, 75.4044],
  ['Karnataka', 'Kalaburagi', 17.3297, 76.8343],
  ['Karnataka', 'Kodagu', 12.4244, 75.7382],
  ['Karnataka', 'Kolar', 13.1362, 78.1296],
  ['Karnataka', 'Koppal', 15.3453, 76.1554],
  ['Karnataka', 'Mandya', 12.5221, 76.897],
  ['Karnataka', 'Mysuru', 12.2958, 76.6394],
  ['Karnataka', 'Raichur', 16.2076, 77.3463],
  ['Karnataka', 'Shivamogga', 13.9299, 75.5681],
  ['Karnataka', 'Tumakuru', 13.3409, 77.1011],
  ['Karnataka', 'Udupi', 13.3409, 74.7421],
  ['Karnataka', 'Uttara Kannada', 14.7951, 74.124],
  ['Karnataka', 'Vijayanagara', 15.2695, 76.3905],
  ['Karnataka', 'Vijayapura', 16.8302, 75.71],
  ['Karnataka', 'Yadgir', 16.7625, 77.1428],
  // Tamil Nadu
  ['Tamil Nadu', 'Ariyalur', 11.1401, 79.0766],
  ['Tamil Nadu', 'Coimbatore', 11.0168, 76.9558],
  ['Tamil Nadu', 'Cuddalore', 11.7443, 79.7684],
  ['Tamil Nadu', 'Dharmapuri', 12.127, 78.1579],
  ['Tamil Nadu', 'Dindigul', 10.3629, 77.9752],
  ['Tamil Nadu', 'Erode', 11.341, 77.7172],
  ['Tamil Nadu', 'Kancheepuram', 12.8342, 79.7036],
  ['Tamil Nadu', 'Kanniyakumari', 8.0883, 77.5385],
  ['Tamil Nadu', 'Karur', 10.9601, 78.0766],
  ['Tamil Nadu', 'Krishnagiri', 12.5186, 78.2137],
  ['Tamil Nadu', 'Madurai', 9.9252, 78.1198],
  ['Tamil Nadu', 'Nagapattinam', 10.7765, 79.8424],
  ['Tamil Nadu', 'Namakkal', 11.2213, 78.1652],
  ['Tamil Nadu', 'Perambalur', 11.2336, 78.8679],
  ['Tamil Nadu', 'Pudukkottai', 10.3813, 78.8214],
  ['Tamil Nadu', 'Ramanathapuram', 9.3711, 78.8328],
  ['Tamil Nadu', 'Salem', 11.6643, 78.146],
  ['Tamil Nadu', 'Sivaganga', 9.8433, 78.4809],
  ['Tamil Nadu', 'Thanjavur', 10.787, 79.1378],
  ['Tamil Nadu', 'The Nilgiris', 11.4102, 76.695],
  ['Tamil Nadu', 'Theni', 10.0104, 77.4768],
  ['Tamil Nadu', 'Thiruvallur', 13.1439, 79.9089],
  ['Tamil Nadu', 'Thiruvarur', 10.7732, 79.6368],
  ['Tamil Nadu', 'Thoothukkudi', 8.7642, 78.1348],
  ['Tamil Nadu', 'Tiruchirappalli', 10.7905, 78.7047],
  ['Tamil Nadu', 'Tirunelveli', 8.7139, 77.7567],
  ['Tamil Nadu', 'Tiruppur', 10.7949, 77.7054],
  ['Tamil Nadu', 'Tiruvannamalai', 12.2253, 79.0747],
  ['Tamil Nadu', 'Vellore', 12.9165, 79.1325],
  ['Tamil Nadu', 'Viluppuram', 11.9391, 79.4923],
  ['Tamil Nadu', 'Virudhunagar', 9.581, 77.9624],
];

const map = new Map();
for (const [state, district, lat, lng] of ROWS) {
  map.set(`${normalizeKey(state)}|${normalizeKey(district)}`, { lat, lng });
}

export function getDistrictCentroid(state, districtName) {
  const k = `${normalizeKey(state)}|${normalizeKey(districtName)}`;
  return map.get(k) ?? null;
}
