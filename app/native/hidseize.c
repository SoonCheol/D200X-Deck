// Seize only the D200 keyboard HID collection (usage page 1, usage 6) so its
// firmware fallback keystrokes ("www.ulanzistudio.com") never reach macOS.
//
// The page interface (usage page 12) is left alone; our app owns it via hidapi.
// Requires Input Monitoring permission; retries until it is granted.
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDManager.h>
#include <IOKit/hid/IOHIDKeys.h>
#include <signal.h>
#include <stdio.h>
#include <unistd.h>

static volatile int running = 1;
static void stop(int sig) { (void)sig; running = 0; }

int main(void) {
    signal(SIGINT, stop);
    signal(SIGTERM, stop);

    int warned = 0;
    while (running) {
        IOHIDManagerRef mgr = IOHIDManagerCreate(kCFAllocatorDefault, kIOHIDOptionsTypeNone);
        CFMutableDictionaryRef match = CFDictionaryCreateMutable(
            kCFAllocatorDefault, 0, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);

        int vid = 0x2207, pid = 0x0019, usagePage = 1, usage = 6;
        CFNumberRef vidRef = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &vid);
        CFNumberRef pidRef = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &pid);
        CFNumberRef upRef = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &usagePage);
        CFNumberRef uRef = CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &usage);

        CFDictionarySetValue(match, CFSTR(kIOHIDVendorIDKey), vidRef);
        CFDictionarySetValue(match, CFSTR(kIOHIDProductIDKey), pidRef);
        CFDictionarySetValue(match, CFSTR(kIOHIDPrimaryUsagePageKey), upRef);
        CFDictionarySetValue(match, CFSTR(kIOHIDPrimaryUsageKey), uRef);
        IOHIDManagerSetDeviceMatching(mgr, match);

        IOReturn r = IOHIDManagerOpen(mgr, kIOHIDOptionsTypeSeizeDevice);
        if (r == kIOReturnSuccess) {
            fprintf(stderr, "seized\n");
            fflush(stderr);
            while (running) sleep(1);
            IOHIDManagerClose(mgr, kIOHIDOptionsTypeNone);
            CFRelease(mgr);
            break;
        }

        if (!warned) {
            fprintf(stderr, "notpermitted 0x%x\n", r);
            fflush(stderr);
            warned = 1;
        }
        CFRelease(mgr);
        sleep(3);
    }
    return 0;
}
