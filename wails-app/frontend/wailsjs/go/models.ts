export namespace main {
	
	export class JiraCredentials {
	    Server: string;
	    Username: string;
	    Password: string;
	
	    static createFrom(source: any = {}) {
	        return new JiraCredentials(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Server = source["Server"];
	        this.Username = source["Username"];
	        this.Password = source["Password"];
	    }
	}
	export class JiraProfile {
	    DisplayName: string;
	    AvatarURL: string;
	
	    static createFrom(source: any = {}) {
	        return new JiraProfile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.DisplayName = source["DisplayName"];
	        this.AvatarURL = source["AvatarURL"];
	    }
	}
	export class JiraProject {
	    Key: string;
	    Name: string;
	    AvatarURL: string;
	
	    static createFrom(source: any = {}) {
	        return new JiraProject(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.Key = source["Key"];
	        this.Name = source["Name"];
	        this.AvatarURL = source["AvatarURL"];
	    }
	}
	export class Repository {
	    ID: number;
	    Name: string;
	    Path: string;
	    JiraKey: string;
	    JiraName: string;
	    JiraAvatar: string;
	
	    static createFrom(source: any = {}) {
	        return new Repository(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.ID = source["ID"];
	        this.Name = source["Name"];
	        this.Path = source["Path"];
	        this.JiraKey = source["JiraKey"];
	        this.JiraName = source["JiraName"];
	        this.JiraAvatar = source["JiraAvatar"];
	    }
	}

}

