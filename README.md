# GCS.uno Server

GCS.uno Server is a web-based Ground Control System application for remote control (BVLOS) of autonomous air and ground vehicles.  
It supports DJI drones and MAVLink-based drones such as Ardupilot, PX4 and others. 


![Screenshot](.readme_images/gcs_uno_ss_1.png)


##  Features

* Live remote control using keyboard, onscreen joystick or regular gamepads
* Live video streaming
* Mission planner
* Autonomous mission flights
* Dataflash logs analyzer
* Connect with any desktop ground control app (QGroundControl, Mission Planner) simultaneously


##  Supported autopilots 

![Supported Autopilots](.readme_images/Supported_Autopilots.png)

GCS.uno Server communicates with [Ardupilot](http://ardupilot.org) and [PX4](https://px4.io) autopilot boards using raw [MAVLink](https://mavlink.io/en/) protocol (both V.1 and V.2 with automatic detection).  
MAVLink autopilots can be connected to GCS.uno Server in various ways.  
Check [Connect MAVLink drones](https://docs.gcs.uno/ConnectDrone/Connect-Ardupilot-PX4-drones/) for more info.  

DJI drones use our [GCS.uno iOS mobile app](https://docs.gcs.uno/ConnectDrone/GCS_uno_iOS_app/) to connect to local or remote server.  
Check [Connect DJI drones](https://docs.gcs.uno/ConnectDrone/Connect-DJI-drones/) for more info. 


## Under the hood

GCS.uno Server runs in [NodeJS](https://nodejs.org/en/) environment and uses [Redis Server](https://redislabs.com)
as in-memory key-value store and [RethinkDB](https://www.rethinkdb.com) as a document database.  
[Nimble Streamer](https://wmspanel.com/nimble) is used as a self-hosted video streaming server.
[Wowza Streaming Cloud](https://www.wowza.com/products/streaming-cloud) can be used instead of self-hosted media server.  

The pilot's dashboard can be accessed from any modern browser. We recommend [Google Chrome](https://www.google.ru/chrome/) or other [Chromium-based browsers](https://en.wikipedia.org/wiki/Chromium_(web_browser)#Browsers_based_on_Chromium).


Follow [installation guide](https://docs.gcs.uno/ServerSetup/BasicInstallation/) to setup your system.


[Documentation](https://docs.gcs.uno/)
[GCS.uno website](https://www.gcs.uno/)  
[Support forum](https://www.gcs.uno/support-forum)  
[GCS.uno Server License](https://docs.gcs.uno/Legal/License/)  
