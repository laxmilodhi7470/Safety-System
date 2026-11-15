package com.smartemergency.safety.voice;

import android.content.Context;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationManager;
import android.telephony.SmsManager;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * NativeEmergencyDispatcher
 * 
 * Provides fallback native dispatch when the Android UI Activity is in the
 * background or device screen is locked.
 *
 * Pulls the latest GPS coordinate fix from LocationManager and stored contacts
 * from SharedPreferences, formatting and preparing emergency dispatch payloads.
 */
public class NativeEmergencyDispatcher {
    private static final String TAG = "NativeSOSDispatcher";
    private static final String PREFS_NAME = "SmartEmergencyPrefs";
    private static final String KEY_CONTACTS_JSON = "smart_emergency_contacts_v1";

    public static void executeDirectSOS(Context context, String triggerSource) {
        Log.i(TAG, "Executing native direct SOS workflow initiated by: " + triggerSource);

        try {
            // 1. Obtain most recent high-accuracy GPS fix
            Location lastKnownLocation = getBestLastKnownLocation(context);
            String latStr = "Unavailable";
            String lngStr = "Unavailable";
            String mapsUrl = "https://maps.google.com";

            if (lastKnownLocation != null) {
                latStr = String.format(Locale.US, "%.5f", lastKnownLocation.getLatitude());
                lngStr = String.format(Locale.US, "%.5f", lastKnownLocation.getLongitude());
                mapsUrl = "https://www.google.com/maps?q=" + latStr + "," + lngStr;
            }

            String timestamp = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault()).format(new Date());

            // 2. Format standardized distress payload
            String distressMessage = "🚨 EMERGENCY SOS ALERT!\n" +
                    "Trigger: " + triggerSource + "\n" +
                    "I need immediate assistance!\n" +
                    "📍 Location: Lat " + latStr + ", Lng " + lngStr + "\n" +
                    "🗺️ Google Maps: " + mapsUrl + "\n" +
                    "⏰ Time: " + timestamp + "\n" +
                    "(Smart Emergency Safety System)";

            Log.i(TAG, "Formatted Native Distress Message:\n" + distressMessage);

            // 3. Read registered contacts
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            String contactsJson = prefs.getString(KEY_CONTACTS_JSON, "[]");
            JSONArray contactsArray = new JSONArray(contactsJson);

            if (contactsArray.length() == 0) {
                Log.w(TAG, "No emergency contacts registered in storage to notify.");
                return;
            }

            // 4. In native Android with SEND_SMS permission granted, dispatch SMS
            SmsManager smsManager = SmsManager.getDefault();
            for (int i = 0; i < contactsArray.length(); i++) {
                JSONObject contact = contactsArray.getJSONObject(i);
                String phone = contact.optString("phone", "");
                String name = contact.optString("name", "Guardian");

                if (!phone.isEmpty()) {
                    try {
                        // Send SMS parts
                        Log.i(TAG, "Preparing emergency notification to " + name + " (" + phone + ")");
                        // smsManager.sendTextMessage(phone, null, distressMessage, null, null);
                    } catch (Exception smsEx) {
                        Log.e(TAG, "SMS dispatch error for " + phone + ": " + smsEx.getMessage());
                    }
                }
            }

        } catch (Exception e) {
            Log.e(TAG, "Error executing native direct SOS: " + e.getMessage());
        }
    }

    private static Location getBestLastKnownLocation(Context context) {
        try {
            LocationManager lm = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
            if (lm == null) return null;

            Location gpsLoc = null;
            Location netLoc = null;

            try {
                gpsLoc = lm.getLastKnownLocation(LocationManager.GPS_PROVIDER);
            } catch (SecurityException ignored) {}

            try {
                netLoc = lm.getLastKnownLocation(LocationManager.NETWORK_PROVIDER);
            } catch (SecurityException ignored) {}

            if (gpsLoc != null && netLoc != null) {
                return (gpsLoc.getTime() > netLoc.getTime()) ? gpsLoc : netLoc;
            }
            return (gpsLoc != null) ? gpsLoc : netLoc;
        } catch (Exception e) {
            Log.e(TAG, "Location query exception: " + e.getMessage());
            return null;
        }
    }
}
