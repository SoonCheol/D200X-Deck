// Seize only the D200 keyboard HID collection (usage page 1, usage 6) so its
// firmware fallback keystrokes ("www.ulanzistudio.com") never reach macOS.
//
// The page interface (usage page 12) is left alone; the app owns it via hidapi.
#include <CoreFoundation/CoreFoundation.h>
#include <IOKit/hid/IOHIDManager.h>
#include <IOKit/hid/IOHIDKeys.h>
#include <dlfcn.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>

static volatile int running = 1;
static void stop(int sig) { (void)sig; running = 0; }

typedef int (*IOHIDCheckAccessFn)(int);
typedef bool (*IOHIDRequestAccessFn)(int);
#define kIOHIDRequestTypeListenEvent 1
#define kIOHIDAccessTypeGranted 0

static IOHIDManagerRef make_manager(void) {
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
    // Device usage pair (not the "primary usage" property).
    CFDictionarySetValue(match, CFSTR(kIOHIDDeviceUsagePageKey), upRef);
    CFDictionarySetValue(match, CFSTR(kIOHIDDeviceUsageKey), uRef);
    IOHIDManagerSetDeviceMatching(mgr, match);
    CFRelease(vidRef); CFRelease(pidRef); CFRelease(upRef); CFRelease(uRef); CFRelease(match);
    return mgr;
}

int main(void) {
    signal(SIGINT, stop);
    signal(SIGTERM, stop);

    IOHIDCheckAccessFn checkAccess = (IOHIDCheckAccessFn)dlsym(RTLD_DEFAULT, "IOHIDCheckAccess");
    IOHIDRequestAccessFn requestAccess = (IOHIDRequestAccessFn)dlsym(RTLD_DEFAULT, "IOHIDRequestAccess");
    if (checkAccess) {
        int access = checkAccess(kIOHIDRequestTypeListenEvent);
        fprintf(stderr, "access %d\n", access);
        if (access != kIOHIDAccessTypeGranted && requestAccess) {
            requestAccess(kIOHIDRequestTypeListenEvent);
        }
        fflush(stderr);
    }

    int warned = 0;
    while (running) {
        if (getppid() == 1) break; // parent app exited
        IOHIDManagerRef mgr = make_manager();
        IOReturn r = IOHIDManagerOpen(mgr, kIOHIDOptionsTypeNone);
        if (r != kIOReturnSuccess) {
            if (!warned) { fprintf(stderr, "manager 0x%x\n", r); fflush(stderr); warned = 1; }
            CFRelease(mgr); sleep(3); continue;
        }
        CFSetRef devices = IOHIDManagerCopyDevices(mgr);
        int seized = 0;
        if (devices) {
            CFIndex n = CFSetGetCount(devices);
            const void **list = calloc((size_t)n, sizeof(void *));
            if (list) {
                CFSetGetValues(devices, list);
                for (CFIndex i = 0; i < n; i++) {
                    IOHIDDeviceRef dev = (IOHIDDeviceRef)list[i];
                    CFTypeRef up = IOHIDDeviceGetProperty(dev, CFSTR(kIOHIDPrimaryUsagePageKey));
                    CFTypeRef u = IOHIDDeviceGetProperty(dev, CFSTR(kIOHIDPrimaryUsageKey));
                    int usagePage = 0, usage = 0;
                    if (up) CFNumberGetValue(up, kCFNumberIntType, &usagePage);
                    if (u) CFNumberGetValue(u, kCFNumberIntType, &usage);
                    if (!warned) fprintf(stderr, "match %ld page=%d usage=%d\n", (long)i, usagePage, usage);
                    if (usagePage == 1 && usage == 6) {
                        IOReturn s = IOHIDDeviceOpen(dev, kIOHIDOptionsTypeSeizeDevice);
                        if (s == kIOReturnSuccess) seized++;
                        else if (!warned) fprintf(stderr, "seize 0x%x\n", s);
                    }
                }
                free(list);
            }
            CFRelease(devices);
        }
        fflush(stderr);
        if (seized > 0) {
            fprintf(stderr, "seized %d\n", seized);
            fflush(stderr);
            // Hold the seizure while the deck stays attached. When it is
            // unplugged, close the manager and go back to polling so a
            // re-plugged deck is seized again without restarting the app.
            while (running && getppid() != 1) {
                sleep(1);
                CFSetRef now = IOHIDManagerCopyDevices(mgr);
                CFIndex present = now ? CFSetGetCount(now) : 0;
                if (now) CFRelease(now);
                if (present == 0) {
                    fprintf(stderr, "released\n");
                    fflush(stderr);
                    break;
                }
            }
            IOHIDManagerClose(mgr, kIOHIDOptionsTypeNone);
            CFRelease(mgr);
            warned = 1;
            continue;
        }
        CFRelease(mgr);
        warned = 1;
        sleep(3);
    }
    return 0;
}
