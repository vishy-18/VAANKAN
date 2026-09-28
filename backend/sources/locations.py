from dataclasses import dataclass


@dataclass(frozen=True)
class WeatherLocation:
    location_id: str
    city: str
    district: str
    state: str
    latitude: float
    longitude: float


# Representative monitoring locations; these do not represent complete national coverage.
INDIAN_WEATHER_LOCATIONS = (
    WeatherLocation("srinagar", "Srinagar", "Srinagar", "Jammu and Kashmir", 34.0837, 74.7973),
    WeatherLocation("jammu", "Jammu", "Jammu", "Jammu and Kashmir", 32.7266, 74.8570),
    WeatherLocation("leh", "Leh", "Leh", "Ladakh", 34.1526, 77.5771),
    WeatherLocation("shimla", "Shimla", "Shimla", "Himachal Pradesh", 31.1048, 77.1734),
    WeatherLocation("dehradun", "Dehradun", "Dehradun", "Uttarakhand", 30.3165, 78.0322),
    WeatherLocation("chandigarh", "Chandigarh", "Chandigarh", "Chandigarh", 30.7333, 76.7794),
    WeatherLocation("delhi", "New Delhi", "New Delhi", "Delhi", 28.6139, 77.2090),
    WeatherLocation("jaipur", "Jaipur", "Jaipur", "Rajasthan", 26.9124, 75.7873),
    WeatherLocation("jodhpur", "Jodhpur", "Jodhpur", "Rajasthan", 26.2389, 73.0243),
    WeatherLocation("jaisalmer", "Jaisalmer", "Jaisalmer", "Rajasthan", 26.9157, 70.9083),
    WeatherLocation("udaipur", "Udaipur", "Udaipur", "Rajasthan", 24.5854, 73.7125),
    WeatherLocation("lucknow", "Lucknow", "Lucknow", "Uttar Pradesh", 26.8467, 80.9462),
    WeatherLocation("varanasi", "Varanasi", "Varanasi", "Uttar Pradesh", 25.3176, 82.9739),
    WeatherLocation("prayagraj", "Prayagraj", "Prayagraj", "Uttar Pradesh", 25.4358, 81.8463),
    WeatherLocation("kanpur", "Kanpur", "Kanpur Nagar", "Uttar Pradesh", 26.4499, 80.3319),
    WeatherLocation("patna", "Patna", "Patna", "Bihar", 25.5941, 85.1376),
    WeatherLocation("ranchi", "Ranchi", "Ranchi", "Jharkhand", 23.3441, 85.3096),
    WeatherLocation("kolkata", "Kolkata", "Kolkata", "West Bengal", 22.5726, 88.3639),
    WeatherLocation("siliguri", "Siliguri", "Darjeeling", "West Bengal", 26.7271, 88.3953),
    WeatherLocation("bhubaneswar", "Bhubaneswar", "Khordha", "Odisha", 20.2961, 85.8245),
    WeatherLocation("guwahati", "Guwahati", "Kamrup Metropolitan", "Assam", 26.1445, 91.7362),
    WeatherLocation("shillong", "Shillong", "East Khasi Hills", "Meghalaya", 25.5788, 91.8933),
    WeatherLocation("agartala", "Agartala", "West Tripura", "Tripura", 23.8315, 91.2868),
    WeatherLocation("imphal", "Imphal", "Imphal West", "Manipur", 24.8170, 93.9368),
    WeatherLocation("aizawl", "Aizawl", "Aizawl", "Mizoram", 23.7271, 92.7176),
    WeatherLocation("kohima", "Kohima", "Kohima", "Nagaland", 25.6751, 94.1086),
    WeatherLocation("itanagar", "Itanagar", "Papum Pare", "Arunachal Pradesh", 27.0844, 93.6053),
    WeatherLocation("gangtok", "Gangtok", "Gangtok", "Sikkim", 27.3389, 88.6065),
    WeatherLocation("ahmedabad", "Ahmedabad", "Ahmedabad", "Gujarat", 23.0225, 72.5714),
    WeatherLocation("bhuj", "Bhuj", "Kutch", "Gujarat", 23.2420, 69.6669),
    WeatherLocation("surat", "Surat", "Surat", "Gujarat", 21.1702, 72.8311),
    WeatherLocation("mumbai", "Mumbai", "Mumbai Suburban", "Maharashtra", 19.0760, 72.8777),
    WeatherLocation("pune", "Pune", "Pune", "Maharashtra", 18.5204, 73.8567),
    WeatherLocation("nagpur", "Nagpur", "Nagpur", "Maharashtra", 21.1458, 79.0882),
    WeatherLocation("panaji", "Panaji", "North Goa", "Goa", 15.4909, 73.8278),
    WeatherLocation("bhopal", "Bhopal", "Bhopal", "Madhya Pradesh", 23.2599, 77.4126),
    WeatherLocation("indore", "Indore", "Indore", "Madhya Pradesh", 22.7196, 75.8577),
    WeatherLocation("raipur", "Raipur", "Raipur", "Chhattisgarh", 21.2514, 81.6296),
    WeatherLocation("hyderabad", "Hyderabad", "Hyderabad", "Telangana", 17.3850, 78.4867),
    WeatherLocation("vijayawada", "Vijayawada", "NTR", "Andhra Pradesh", 16.5062, 80.6480),
    WeatherLocation("visakhapatnam", "Visakhapatnam", "Visakhapatnam", "Andhra Pradesh", 17.6868, 83.2185),
    WeatherLocation("bengaluru", "Bengaluru", "Bengaluru Urban", "Karnataka", 12.9716, 77.5946),
    WeatherLocation("mysuru", "Mysuru", "Mysuru", "Karnataka", 12.2958, 76.6394),
    WeatherLocation("mangaluru", "Mangaluru", "Dakshina Kannada", "Karnataka", 12.9141, 74.8560),
    WeatherLocation("chennai", "Chennai", "Chennai", "Tamil Nadu", 13.0827, 80.2707),
    WeatherLocation("cuddalore", "Cuddalore", "Cuddalore", "Tamil Nadu", 11.7480, 79.7714),
    WeatherLocation("tiruchirappalli", "Tiruchirappalli", "Tiruchirappalli", "Tamil Nadu", 10.7905, 78.7047),
    WeatherLocation("coimbatore", "Coimbatore", "Coimbatore", "Tamil Nadu", 11.0168, 76.9558),
    WeatherLocation("madurai", "Madurai", "Madurai", "Tamil Nadu", 9.9252, 78.1198),
    WeatherLocation("kochi", "Kochi", "Ernakulam", "Kerala", 9.9312, 76.2673),
    WeatherLocation("thiruvananthapuram", "Thiruvananthapuram", "Thiruvananthapuram", "Kerala", 8.5241, 76.9366),
    WeatherLocation("port-blair", "Port Blair", "South Andaman", "Andaman and Nicobar Islands", 11.6234, 92.7265),
)
